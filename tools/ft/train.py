#!/usr/bin/env python3
"""
tools/ft/train.py — Payesh Engineering SFT (LoRA) training — Stage D/E

Real fine-tuning: LoRA adapter on a small CPU-trainable base model over the
Payesh engineering dataset built from real git fix commits + PEES lessons.

Usage:  python tools/ft/train.py --epochs N --run-id ID
"""
import argparse, json, os, sys, time, hashlib, subprocess, shutil

def parse():
    p = argparse.ArgumentParser()
    p.add_argument('--dataset', default=os.path.join(os.path.dirname(__file__), 'dataset', 'payesh-sft-train.jsonl'))
    p.add_argument('--base-model', default=os.path.join(os.path.dirname(__file__), 'base-model'))
    p.add_argument('--out', default=os.path.join(os.path.dirname(__file__), 'runs'))
    p.add_argument('--run-id', default=None)
    p.add_argument('--epochs', type=int, default=3)
    p.add_argument('--lr', type=float, default=2e-4)
    p.add_argument('--batch', type=int, default=1)
    p.add_argument('--grad-accum', type=int, default=4)
    p.add_argument('--max-len', type=int, default=1024)
    p.add_argument('--lora-r', type=int, default=8)
    p.add_argument('--lora-alpha', type=int, default=16)
    return p.parse_args()

def sha256_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

def main():
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM, TrainingArguments
    from peft import LoraConfig, get_peft_model
    from torch.utils.data import Dataset

    args = parse()
    run_id = args.run_id or ('run-' + time.strftime('%Y%m%d-%H%M%S'))
    out_dir = os.path.join(args.out, run_id)
    os.makedirs(out_dir, exist_ok=True)

    # ---------------------------------------------------------------- provenance
    # git worktrees on Windows store .git as a pointer file; resolve via rev-parse
    def git_head():
        try:
            return subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip()
        except Exception:
            return 'UNKNOWN'
    ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    repo_head = git_head()
    # read dataset manifest
    man_path = os.path.join(os.path.dirname(args.dataset), 'manifest.json')
    manifest = json.load(open(man_path))

    print(f"[train] run_id={run_id}")
    print(f"[train] repo_head={repo_head}")
    print(f"[train] dataset_version={manifest['dataset_version']}")
    print(f"[train] torch={torch.__version__}")

    # ---------------------------------------------------------------- data
    rows = [json.loads(l) for l in open(args.dataset) if l.strip()]
    print(f"[train] samples={len(rows)}")

    tok = AutoTokenizer.from_pretrained(args.base_model)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    class SFTData(Dataset):
        def __init__(self, rows):
            self.rows = rows
        def __len__(self):
            return len(self.rows)
        def __getitem__(self, i):
            r = self.rows[i]
            text = f"### Instruction:\n{r['instruction']}\n\n### Response:\n{r['output']}{tok.eos_token}"
            enc = tok(text, truncation=True, max_length=args.max_len, return_tensors=None)
            ids = enc['input_ids']
            labels = list(ids)
            return {'input_ids': ids, 'labels': labels, 'attention_mask': [1] * len(ids)}

    ds = SFTData(rows)

    # ---------------------------------------------------------------- model
    print("[train] loading base model (CPU, fp32)...")
    model = AutoModelForCausalLM.from_pretrained(args.base_model, torch_dtype=torch.float32)
    model.config.use_cache = False

    lcfg = LoraConfig(
        r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=0.05, bias='none',
        task_type='CAUSAL_LM',
        target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj'],
    )
    model = get_peft_model(model, lcfg)
    model.print_trainable_parameters()

    # ---------------------------------------------------------------- train
    from transformers import Trainer
    targs = TrainingArguments(
        output_dir=os.path.join(out_dir, 'ckpt'),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        logging_steps=1,
        save_strategy='no',
        report_to=[],
        use_cpu=True,
        seed=42,
        remove_unused_columns=False,
    )
    trainer = Trainer(model=model, args=targs, train_dataset=ds)
    t0 = time.time()
    trainer.train()
    dur = time.time() - t0

    # ---------------------------------------------------------------- artifact
    adapter_dir = os.path.join(out_dir, 'adapter')
    model.save_pretrained(adapter_dir)
    tok.save_pretrained(adapter_dir)

    # gather metrics from log history
    log = trainer.state.log_history
    losses = [x['loss'] for x in log if 'loss' in x]
    final_loss = losses[-1] if losses else None

    adapter_files = []
    for f in sorted(os.listdir(adapter_dir)):
        adapter_files.append({'file': f, 'sha256': sha256_file(os.path.join(adapter_dir, f))})

    run_manifest = {
        'run_id': run_id,
        'base_model': 'Qwen/Qwen2.5-0.5B',
        'base_model_path': args.base_model,
        'method': 'LoRA (PEFT) SFT, CPU fp32',
        'dataset_version': manifest['dataset_version'],
        'dataset_sha256': manifest['train_sha256'],
        'repo_head': repo_head,
        'epochs': args.epochs,
        'lr': args.lr,
        'lora_r': args.lora_r,
        'lora_alpha': args.lora_alpha,
        'samples': len(rows),
        'steps': trainer.state.global_step,
        'final_loss': final_loss,
        'loss_curve': losses,
        'duration_sec': round(dur, 1),
        'started_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(t0)),
        'adapter_dir': adapter_dir,
        'adapter_files': adapter_files,
    }
    with open(os.path.join(out_dir, 'run-manifest.json'), 'w') as f:
        json.dump(run_manifest, f, indent=2)
    print(json.dumps({k: run_manifest[k] for k in ['run_id', 'steps', 'final_loss', 'duration_sec', 'samples']}, indent=2))
    print("TRAIN_DONE")

if __name__ == '__main__':
    main()
