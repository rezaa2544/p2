#!/usr/bin/env python3
"""
tools/ft/train-lean.py — memory-lean LoRA SFT for the CPU/WSL2 environment.

Why a custom loop: transformers Trainer + AdamW on a 0.5B fp32 model needs
>4GB (weights + grads + optimizer states), and the WSL2 VM only has ~6.9GB.
The stock Trainer dies silently during init. This loop:
  - keeps the base model frozen and never materializes grads for it,
  - uses pure SGD with momentum on LoRA params only (no 2x/4x Adam states),
  - processes one sample at a time (batch=1) with gradient checkpointing,
  - logs loss per step and saves the adapter.
"""
import argparse, json, os, time, hashlib, subprocess, gc

def parse():
    p = argparse.ArgumentParser()
    p.add_argument('--dataset', default=None)
    p.add_argument('--base-model', default=None)
    p.add_argument('--out', default=None)
    p.add_argument('--run-id', default=None)
    p.add_argument('--epochs', type=int, default=3)
    p.add_argument('--lr', type=float, default=1e-3)
    p.add_argument('--max-len', type=int, default=768)
    p.add_argument('--lora-r', type=int, default=8)
    p.add_argument('--lora-alpha', type=int, default=16)
    return p.parse_args()

def sha256_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''):
            h.update(c)
    return h.hexdigest()

def main():
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import LoraConfig, get_peft_model

    here = os.path.dirname(os.path.abspath(__file__))
    a = parse()
    a.dataset = a.dataset or os.path.join(here, 'dataset', 'payesh-sft-train.jsonl')
    a.base_model = a.base_model or os.path.join(here, 'base-model')
    run_id = a.run_id or ('run-' + time.strftime('%Y%m%d-%H%M%S'))
    out_dir = a.out or os.path.join(here, 'runs', run_id)
    os.makedirs(out_dir, exist_ok=True)

    man_path = os.path.join(os.path.dirname(a.dataset), 'manifest.json')
    manifest = json.load(open(man_path))

    torch.set_num_threads(4)
    torch.manual_seed(42)

    print(f"[train-lean] run_id={run_id}", flush=True)
    print(f"[train-lean] torch={torch.__version__} threads={torch.get_num_threads()}", flush=True)

    rows = [json.loads(l) for l in open(a.dataset) if l.strip()]
    print(f"[train-lean] samples={len(rows)} epochs={a.epochs}", flush=True)

    tok = AutoTokenizer.from_pretrained(a.base_model)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    print("[train-lean] loading base model...", flush=True)
    model = AutoModelForCausalLM.from_pretrained(a.base_model, dtype=torch.float32)
    model.config.use_cache = False
    model.gradient_checkpointing_enable()

    lcfg = LoraConfig(
        r=a.lora_r, lora_alpha=a.lora_alpha, lora_dropout=0.0, bias='none',
        task_type='CAUSAL_LM',
        target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj'],
    )
    model = get_peft_model(model, lcfg)
    model.print_trainable_parameters()

    # Only LoRA params get grads; base stays frozen in memory.
    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.SGD(params, lr=a.lr, momentum=0.9)

    losses = []
    step = 0
    t0 = time.time()

    for ep in range(a.epochs):
        for i, r in enumerate(rows):
            text = f"### Instruction:\n{r['instruction']}\n\n### Response:\n{r['output']}{tok.eos_token}"
            enc = tok(text, truncation=True, max_length=a.max_len, return_tensors='pt')
            input_ids = enc['input_ids']
            labels = input_ids.clone()
            try:
                out = model(input_ids=input_ids, labels=labels)
                loss = out.loss
                opt.zero_grad(set_to_none=True)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(params, 1.0)
                opt.step()
                lv = loss.item()
                losses.append(lv)
                step += 1
                if step % 5 == 0 or step == 1:
                    print(f"[train-lean] ep{ep} sample{i} step{step} loss={lv:.4f} ({time.time()-t0:.0f}s)", flush=True)
                del out, loss, input_ids, labels
            except torch.cuda.OutOfMemoryError:
                print(f"[train-lean] OOM at step {step}; skipping", flush=True)
                opt.zero_grad(set_to_none=True)
                gc.collect()
            except RuntimeError as e:
                if 'out of memory' in str(e).lower():
                    print(f"[train-lean] OOM at step {step}; skipping", flush=True)
                    opt.zero_grad(set_to_none=True)
                    gc.collect()
                else:
                    raise

    dur = time.time() - t0

    # ---- save adapter ----
    adapter_dir = os.path.join(out_dir, 'adapter')
    model.save_pretrained(adapter_dir)
    tok.save_pretrained(adapter_dir)

    adapter_files = [{'file': f, 'sha256': sha256_file(os.path.join(adapter_dir, f))}
                     for f in sorted(os.listdir(adapter_dir))]

    run_man = {
        'run_id': run_id,
        'base_model': 'Qwen/Qwen2.5-0.5B',
        'method': 'LoRA (PEFT) SFT, CPU fp32, SGD-momentum, gradient checkpointing',
        'dataset_version': manifest['dataset_version'],
        'dataset_sha256': manifest['train_sha256'],
        'epochs': a.epochs,
        'lr': a.lr,
        'lora_r': a.lora_r,
        'lora_alpha': a.lora_alpha,
        'samples': len(rows),
        'steps': step,
        'final_loss': losses[-1] if losses else None,
        'loss_curve': losses,
        'duration_sec': round(dur, 1),
        'started_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(t0)),
        'adapter_dir': adapter_dir,
        'adapter_files': adapter_files,
    }
    with open(os.path.join(out_dir, 'run-manifest.json'), 'w') as f:
        json.dump(run_man, f, indent=2)
    print(json.dumps({k: run_man[k] for k in ['run_id', 'steps', 'final_loss', 'duration_sec', 'samples']}, indent=2), flush=True)
    print("TRAIN_DONE", flush=True)

if __name__ == '__main__':
    main()
