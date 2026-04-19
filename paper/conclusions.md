# Conclusions

## What Was Achieved

This project set out to characterize whether a composed privacy architecture — deterministic Safe Harbor stripping, neural routing, and a differentially private bottleneck — could simultaneously satisfy a utility target (task accuracy ≥ 85%) and a privacy bound (verbatim leak rate < 9%) on synthetic clinical trial workloads. The empirical answer is: not simultaneously, not on the document class that matters most.

What was achieved is something more useful than a positive result. The project produced (1) a working prototype of the NGSP architecture with five distinct attack surfaces exercised by a reproducible adversarial harness, (2) a quantitative characterization of where the architecture succeeds and where it fails structurally, and (3) a precise identification of why those failures are not fixable by parameter tuning within the current design. The attack harness — covering verbatim scanning, semantic similarity, embedding inversion, membership inference, and downstream utility — is a reusable evaluation substrate for any proxy-based LLM privacy system evaluated on clinical text.

The headline empirical finding is that **privacy quality is determined primarily by routing path, not by DP noise level**. Sweeping ε from 0.5 to 5.0 (a 10× range) leaves utility and verbatim leak rates unchanged to six decimal places. The DP guarantee holds on the embedding representation; it does not propagate to the proxy text surface, because the decoder is not trained to treat the noisy embedding as a hard constraint. This mismatch between formal DP guarantees and observable text privacy is not unique to this implementation — it is a property of any system that injects DP noise into a hidden-state representation and decodes it with an unmodified language model.

---

## The Privacy-Utility Tradeoff: Why It Is Hard Here

The v1 and v2 results occupy opposite corners of the privacy-utility space, with no intermediate operating point reachable within the current architecture.

**v1** (dp_tolerant path dominates): utility ratio 1.000, verbatim leak rate 76.5%. The proxy is a near-verbatim paraphrase. Cloud responses are accurate because the cloud receives the full clinical context. Privacy fails completely.

**v2** (abstract_extractable path dominates, after routing fix): verbatim leak rate 7.17%, semantic similarity 0% above the 0.85 danger threshold. Privacy wins. Utility ratio drops to 0.266. Cloud responses are too abstract to answer the clinical question asked.

The two operating points are not the endpoints of a smooth curve; they are separated by a routing decision that is binary. The architecture provides no mechanism to modulate abstraction continuously.

The reason neither version achieves the joint hypothesis is structural, not incidental. **SAE narratives are content-coupled tasks**: the sensitive information — compound code, site identifier, dose level, causality rationale — is simultaneously the task-relevant information. An evaluator asking "what is the causality assessment for this adverse event?" cannot receive a useful answer from a proxy that does not transmit the event details. The architecture's core assumption is that task intent and sensitive content are separable — that a synthesized abstract query can carry the intent without carrying the content. For SAE narratives, that assumption is false by the definition of the task.

This is categorically different from tasks where separability holds. A patient scheduling request carries sensitive content (name, date of birth) that is incidental to the task intent (find an available appointment slot). Monitoring visit reports asking about protocol adherence trends can be abstracted without losing the question's substance. For those document classes, the abstract_extractable path achieves near-zero verbatim leakage while preserving utility — the architecture works as designed. The SAE narrative class was chosen precisely because it represents the limit case: it exposes the failure boundary that separable-task benchmarks do not reach.

---

## Three Concrete Directions Forward

**1. A learned proxy decoder.** The proximal cause of the DP noise failing to reach the text surface is that the paraphrase decoder is untrained with respect to the noisy embedding — it treats the hidden-state hint as ignorable and reconstructs output from document context alone. Training a seq2seq decoder on (noisy embedding → privacy-preserving text) pairs, where the target text has entities suppressed, would force the model to use the noisy representation as a hard conditioning signal. This would close the gap between embedding-space DP guarantees and text-surface privacy. The honest assessment: this is technically non-trivial. The training objective must balance entity suppression against task-relevant semantic preservation; without a carefully designed loss, the decoder will either suppress too much (utility loss) or learn to ignore the noise (privacy loss). It is the most promising direction and also the most uncertain one.

**2. A local-only path for SAE causality reasoning.** For content-coupled tasks, keeping the cloud out entirely is the only architectural choice that avoids the privacy-utility tradeoff. A sufficiently capable local model (Gemma 4 at its target scale, or a fine-tuned safety-domain model) could answer SAE causality questions without any outbound API call. The privacy risk is eliminated; the tradeoff becomes local compute versus response quality. At inference time on current hardware, this is feasible for a single document with acceptable latency. The honest assessment: this requires a local model with genuine clinical reasoning capability. SmolLM2-1.7B, used in the current prototype, is too small. Gemma 4 at the target scale is a plausible candidate, but its SAE causality quality has not been evaluated here.

**3. Structured field extraction.** Rather than asking the cloud model to reason over a proxy narrative, extract the specific fields a safety reviewer needs — causality verdict, onset latency, CTCAE grade, dechallenge outcome — using local NER and rule-based extraction, then return structured JSON. No free-text proxy is transmitted; the cloud is not needed at all for the classification step. The honest assessment: this trades generality for privacy. It works only when the task output is a well-defined set of extractable fields, not open-ended clinical reasoning. For structured causality assessments (a large fraction of safety review workload), this may be sufficient. It would not generalize to narrative summarization or open-ended medical writing support.

---

## What the Negative Result Contributes

A system that worked end-to-end with no failure modes would be a less informative research artifact. The value of this evaluation is precisely its specificity about where and why the architecture fails.

Prior evaluations of DP text mechanisms tend to use tasks where sensitive content is incidental — sentiment classification, topic detection, named entity recognition over structured fields. These are separability-favorable tasks by construction. Evaluating on SAE causality narratives — a document class where the sensitive content is the task — tests a different and harder regime. The result is not "DP proxy architectures fail"; it is "DP proxy architectures fail on content-coupled tasks, succeed on separable tasks, and the routing decision between those two classes is the operative privacy control." That is a more useful claim: it tells a practitioner which document classes are safe to route through a proxy-based system and which require a different approach entirely.

The attack harness makes this distinction measurable and reproducible. Verbatim scanning, trained inversion, and semantic similarity evaluation together constitute a three-layer empirical ground truth for text-surface privacy that is independent of mathematical DP guarantees. For any future system that injects noise into hidden-state representations and decodes to text, that harness provides the necessary check that the mathematical guarantee actually propagates to the output a real adversary observes. Knowing where proxy-based LLM privacy fails — and having a rigorous method for detecting those failures — is a more durable contribution than a system that appears to pass without a complete adversarial evaluation.
