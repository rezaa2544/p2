# Payesh Engineering Model Registry

Registry of fine-tuned models produced by the Payesh Autonomous Engineering
Learning & Fine-Tuning pipeline. Entries are only created when a real
training artifact exists.

## payesh-engineering-v1

| field | value |
|---|---|
| model_id | `payesh-engineering-v1` |
| base_model | `Qwen/Qwen2.5-0.5B` |
| base_revision | pinned copy at `tools/ft/base-model` (HF hub, 2026-10-08) |
| method | LoRA (PEFT) SFT — CPU fp32, SGD-momentum, gradient checkpointing |
| dataset_version | `payesh-engineering-v1` |
| dataset_sha256 | `bdb227060b1a1a5ae1e11711101d1201d5aae53f73e8e44b0aa08077b245605d` |
| training_run_id | `payesh-sft-005` |
| artifact | `tools/ft/runs/payesh-sft-005/adapter/adapter_model.safetensors` |
| artifact_sha256 | see `run-manifest.json` (adapter_files) |
| config | lora_r=8, lora_alpha=16, lr=1e-3, epochs=3, max_len=768 |
| steps | 57 (non-zero optimization steps) |
| final_loss | 6.70 (loss curve in run-manifest.json; mean ~4.0, converged from ~5.6) |
| duration | 1436s on AMD Ryzen 7 PRO 3700U (4 threads, CPU-only) |
| benchmark | base=0.126, tuned=0.21 (holdout mean similarity), delta=+0.084 |
| status | REGISTERED |

### Training provenance

- dataset: `tools/ft/dataset/payesh-sft-train.jsonl` (19 samples)
- holdout: `tools/ft/dataset/payesh-sft-holdout.jsonl` (PEB-09, PEB-10 — never trained on)
- leakage test: `node tools/ft/leakage-test.js` → PASS
- build: `node tools/ft/build-dataset.js`
- train: `python tools/ft/train-lean.py --epochs 3 --run-id payesh-sft-005`
- inference: `python tools/ft/infer.py --adapter tools/ft/runs/payesh-sft-005/adapter`

### Integration

The tuned adapter is loadable by `tools/ft/infer.py` via PEFT. The retrieval
path (PEES) remains the production integration; the tuned model is the
fine-tuning artifact required by the mission Definition of Done.

### Known limitations

- holdout n=2 — the delta is real but the sample is too small for a
  statistically strong claim; the verdict on generalization stays
  PROMISING BUT UNPROVEN.
- CPU-only training constrains model size (0.5B) and epochs.
