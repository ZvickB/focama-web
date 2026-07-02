# Sensitive image classification experiment

This branch-only harness evaluates whether clearly safe product-only images can be revealed after the deterministic title/category moderator marks a product image as sensitive.

It does not change production moderation, API responses, or frontend behavior.

## Decision policy

An image is proposed for display only when all of these are true:

- COCO-SSD finds no person at or above `0.35` confidence.
- MediaPipe Face Detection finds no face.
- MoveNet finds no body pose with at least `0.25` overall confidence and five keypoints at `0.30` confidence.

Errors and uncertain results fail closed to `hide`. These thresholds are preliminary and must not become product behavior until reviewed against a representative labeled sample.

NSFWJS was removed after it classified both a safe underwear flat-lay and ordinary sunglasses as unsafe. This experiment now asks the narrower, more relevant question: is a human present in the product image? There is no dependable mannequin-specific detector in this stack, so mannequin images remain a known risk that must be represented heavily in evaluation data.

## Input

Edit `sample-input.json` or provide another JSON file containing an array:

```json
[
  {
    "id": "sample-1",
    "title": "Example product",
    "imageUrl": "https://example.com/image.jpg",
    "expectedOutcome": "show"
  },
  {
    "id": "sample-2",
    "title": "Local review image",
    "imagePath": "temp-data/sensitive-image-evaluation/sample-2.jpg",
    "expectedOutcome": "hide"
  }
]
```

Use HTTPS URLs or local paths. `expectedOutcome` is optional but recommended for measuring errors. Never commit downloaded review images or generated reports.

## Run

```sh
npm run experiment:sensitive-images
```

Custom paths:

```sh
npm run experiment:sensitive-images -- --input path/to/input.json --output temp-data/sensitive-image-evaluation/report.json
```

The evaluator downloads at most 8 MB per image, processes images sequentially, and writes full model scores plus a summary. The most important summary metric is `dangerousFalseReveals`: images labeled `hide` that the experiment proposed showing. That number should be zero before any production integration is considered.

## Evaluation target

Label at least 200 real provider images across:

- flat-lay and packaged adult underwear that should be shown;
- adult underwear modeled by people or mannequins that should stay hidden;
- different skin tones, lighting, crops, and image backgrounds;
- children’s and men’s underwear as control groups;
- confusing beige products and packaging as false-positive controls.

Review every proposed `show` manually. Model output is experimental evidence, not a moderation guarantee.
