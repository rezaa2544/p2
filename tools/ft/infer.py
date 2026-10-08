#!/usr/bin/env python3
"""
tools/ft/infer.py — inference from the tuned artifact (Stage E)

Loads base model + LoRA adapter and generates a response for a prompt.
Also supports base-only (no adapter) for the baseline comparison.

Usage:
  python tools/ft/infer.py --prompt "..." --adapter <dir>
  python tools/ft/infer.py --prompt "..." --base-only
  python tools/ft/infer.py --jsonl <file> --adapter <dir> --out <file>
"""
import argparse, json, os, sys

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--prompt', default=None)
    p.add_argument('--jsonl', default=None, help='batch: jsonl with instruction/output')
    p.add_argument('--adapter', default=None)
    p.add_argument('--base-only', action='store_true')
    p.add_argument('--base-model', default=os.path.join(os.path.dirname(__file__), 'base-model'))
    p.add_argument('--out', default=None)
    p.add_argument('--max-new', type=int, default=256)
    a = p.parse_args()

    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM

    tok = AutoTokenizer.from_pretrained(a.base_model)
    model = AutoModelForCausalLM.from_pretrained(a.base_model, torch_dtype=torch.float32)

    if a.adapter and not a.base_only:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, a.adapter)
        mode = 'TUNED'
    else:
        mode = 'BASE'

    model.eval()

    def gen(instr):
        text = f"### Instruction:\n{instr}\n\n### Response:\n"
        ids = tok(text, return_tensors='pt')
        with torch.no_grad():
            out = model.generate(**ids, max_new_tokens=a.max_new, do_sample=False,
                                 pad_token_id=tok.eos_token_id)
        full = tok.decode(out[0], skip_special_tokens=True)
        return full.split('### Response:\n')[-1].strip()

    results = []
    if a.prompt:
        print(gen(a.prompt))
        return

    rows = [json.loads(l) for l in open(a.jsonl) if l.strip()]
    for r in rows:
        resp = gen(r['instruction'])
        results.append({'instruction': r['instruction'], 'expected': r.get('output', ''),
                        'response': resp, 'mode': mode})
        print(f"[{mode}] {r['instruction'][:60]}... -> {resp[:60]}...", flush=True)

    out = a.out or '/dev/stdout'
    with open(out, 'w') as f:
        for r in results:
            f.write(json.dumps(r) + '\n')
    print(f"WROTE {len(results)} -> {out}")

if __name__ == '__main__':
    main()
