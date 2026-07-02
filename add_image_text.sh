#!/bin/bash
set -e

echo "=== Adding IMAGE_TEXT block type to BrenUp lesson builder ==="

# ── 1. actions.ts ─────────────────────────────────────────────────────────────
# Add "IMAGE_TEXT" to lessonBlockTypes array, right after "IMAGE",
# add blockContentFromForm branch, and add defaultBlockContent branch.

FILE="app/admin/lessons/actions.ts"

# 1a. Add to lessonBlockTypes (after "IMAGE",)
if grep -q '"IMAGE_TEXT"' "$FILE"; then
  echo "✓ actions.ts: lessonBlockTypes already has IMAGE_TEXT — skipping"
else
  sed -i '' 's/  "IMAGE",$/  "IMAGE",\n  "IMAGE_TEXT",/' "$FILE"
  echo "✓ actions.ts: added IMAGE_TEXT to lessonBlockTypes"
fi

# 1b. Add blockContentFromForm branch (insert before the AUDIO branch)
if grep -q 'blockType === "IMAGE_TEXT"' "$FILE"; then
  echo "✓ actions.ts: blockContentFromForm branch already exists — skipping"
else
  # We insert the IMAGE_TEXT branch right before the AUDIO branch
  python3 - "$FILE" << 'PYEOF'
import sys, re

path = sys.argv[1]
text = open(path).read()

image_text_block = '''  if (blockType === "IMAGE_TEXT") {
    return {
      image_position: String(formData.get("image_position") || "left"),
      image_path: String(formData.get("image_path") || "").trim(),
      alt: nullableText(formData.get("alt")),
      caption: nullableText(formData.get("caption")),
      heading: nullableText(formData.get("heading")),
      body: String(formData.get("body") || "").trim()
    };
  }
  if (blockType === "AUDIO") {'''

text = text.replace('  if (blockType === "AUDIO") {', image_text_block, 1)
open(path, 'w').write(text)
print("✓ actions.ts: added IMAGE_TEXT blockContentFromForm branch")
PYEOF
fi

# 1c. Add defaultBlockContent branch (insert before AUDIO default)
if grep -q "IMAGE_TEXT.*image_position" "$FILE"; then
  echo "✓ actions.ts: defaultBlockContent branch already exists — skipping"
else
  python3 - "$FILE" << 'PYEOF'
import sys

path = sys.argv[1]
text = open(path).read()

image_text_default = '''  if (blockType === "IMAGE_TEXT") return {
    image_position: "left",
    image_path: "",
    alt: "",
    caption: null,
    heading: "Section heading",
    body: "Add supporting text here."
  };
  if (blockType === "AUDIO") return { path: "", label: "Audio" };'''

text = text.replace(
    '  if (blockType === "AUDIO") return { path: "", label: "Audio" };',
    image_text_default,
    1
)
open(path, 'w').write(text)
print("✓ actions.ts: added IMAGE_TEXT defaultBlockContent branch")
PYEOF
fi

# ── 2. LessonBuilderWorkspace.tsx ─────────────────────────────────────────────
FILE="components/LessonBuilderWorkspace.tsx"

# 2a. Add to blockTypes array
if grep -q '"IMAGE_TEXT"' "$FILE"; then
  echo "✓ LessonBuilderWorkspace.tsx: blockTypes already has IMAGE_TEXT — skipping"
else
  sed -i '' 's/"IMAGE", "AUDIO"/"IMAGE", "IMAGE_TEXT", "AUDIO"/' "$FILE"
  # fallback if on separate lines
  if ! grep -q '"IMAGE_TEXT"' "$FILE"; then
    sed -i '' 's/  "IMAGE",$/  "IMAGE",\n  "IMAGE_TEXT",/' "$FILE"
  fi
  echo "✓ LessonBuilderWorkspace.tsx: added IMAGE_TEXT to blockTypes"
fi

# 2b. Add label
if grep -q 'IMAGE_TEXT.*Image + Text' "$FILE"; then
  echo "✓ LessonBuilderWorkspace.tsx: label already exists — skipping"
else
  sed -i '' 's/IMAGE: "Image",/IMAGE: "Image", IMAGE_TEXT: "Image + Text",/' "$FILE"
  # fallback if on separate line
  if ! grep -q '"Image + Text"' "$FILE"; then
    sed -i '' 's/    IMAGE: "Image",$/    IMAGE: "Image",\n    IMAGE_TEXT: "Image + Text",/' "$FILE"
  fi
  echo "✓ LessonBuilderWorkspace.tsx: added IMAGE_TEXT label"
fi

# 2c. Add blockSummary fallback for heading field
if grep -q 'data.heading' "$FILE"; then
  echo "✓ LessonBuilderWorkspace.tsx: blockSummary already handles heading — skipping"
else
  sed -i '' 's/data.text ?? data.title ?? data.body ?? data.path/data.text ?? data.title ?? data.body ?? data.heading ?? data.path/' "$FILE"
  echo "✓ LessonBuilderWorkspace.tsx: added heading to blockSummary"
fi

# 2d. Add BlockFields branch for IMAGE_TEXT
if grep -q "blockType === \"IMAGE_TEXT\"" "$FILE"; then
  echo "✓ LessonBuilderWorkspace.tsx: BlockFields IMAGE_TEXT branch already exists — skipping"
else
  python3 - "$FILE" << 'PYEOF'
import sys

path = sys.argv[1]
text = open(path).read()

image_text_fields = '''  if (blockType === "IMAGE_TEXT") {
    return (
      <div className="grid gap-3">
        <label className="text-sm">
          Image position
          <select name="image_position" defaultValue={asString(data.image_position) || "left"} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            <option value="left">Image on left</option>
            <option value="right">Image on right</option>
          </select>
        </label>
        <label className="text-sm">
          Image URL
          <input name="image_path" value={imagePath} onChange={(e) => setImagePath(e.target.value)} placeholder="https://\u2026 or upload below" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <BlockMediaUploader type="image" lessonId={lessonId} currentSrc={imagePath} onUploaded={(url) => setImagePath(url)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Alt text <span className="font-normal text-black/45">(optional)</span><input name="alt" defaultValue={asString(data.alt)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
          <label className="text-sm">Caption <span className="font-normal text-black/45">(optional)</span><input name="caption" defaultValue={asString(data.caption)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        </div>
        <label className="text-sm">Heading <span className="font-normal text-black/45">(optional)</span><input name="heading" defaultValue={asString(data.heading)} placeholder="Section heading" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
        <label className="text-sm">Body text<textarea name="body" rows={4} defaultValue={asString(data.body)} placeholder="Supporting text alongside the image\u2026" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" /></label>
      </div>
    );
  }
  if (blockType === "AUDIO") {'''

# Find the AUDIO BlockFields branch and insert before it
marker = '  if (blockType === "AUDIO") {'
# Only insert once, find the one inside BlockFields (after IMAGE branch)
idx = text.find('  if (blockType === "IMAGE") {')
if idx == -1:
    print("ERROR: Could not find IMAGE BlockFields branch as anchor")
    sys.exit(1)
# Find next AUDIO after the IMAGE branch
audio_idx = text.find(marker, idx)
if audio_idx == -1:
    print("ERROR: Could not find AUDIO BlockFields branch")
    sys.exit(1)
text = text[:audio_idx] + image_text_fields + '\n' + text[audio_idx + len(marker):]
open(path, 'w').write(text)
print("✓ LessonBuilderWorkspace.tsx: added IMAGE_TEXT BlockFields branch")
PYEOF
fi

# Also fix imagePath useState initializer to handle IMAGE_TEXT
if grep -q "blockType === .IMAGE_TEXT. ? asString(data.image_path)" "$FILE"; then
  echo "✓ LessonBuilderWorkspace.tsx: imagePath useState already handles IMAGE_TEXT — skipping"
else
  python3 - "$FILE" << 'PYEOF'
import sys

path = sys.argv[1]
text = open(path).read()

# The existing useState for imagePath — make it also handle IMAGE_TEXT
old = 'blockType === "FLASHCARD" ? asString(data.image_path) :\n    asString(data.path ?? data.src ?? data.url)'
new = 'blockType === "FLASHCARD" ? asString(data.image_path) :\n    blockType === "IMAGE_TEXT" ? asString(data.image_path) :\n    asString(data.path ?? data.src ?? data.url)'

if old in text:
    text = text.replace(old, new, 1)
    open(path, 'w').write(text)
    print("✓ LessonBuilderWorkspace.tsx: imagePath useState updated for IMAGE_TEXT")
else:
    print("⚠ LessonBuilderWorkspace.tsx: imagePath useState pattern not found — may already be correct or structured differently")
PYEOF
fi

# ── 3. LessonBlockPreview.tsx ─────────────────────────────────────────────────
FILE="components/LessonBlockPreview.tsx"

if grep -q '"IMAGE_TEXT"' "$FILE"; then
  echo "✓ LessonBlockPreview.tsx: IMAGE_TEXT renderer already exists — skipping"
else
  python3 - "$FILE" << 'PYEOF'
import sys

path = sys.argv[1]
text = open(path).read()

image_text_renderer = '''  if (block.block_type === "IMAGE_TEXT") {
    const imagePath = asString(content.image_path);
    const src = imagePath ? mediaUrl(imagePath, "image") : "";
    const imageRight = asString(content.image_position) === "right";
    const heading = asString(content.heading);
    const body = asString(content.body);
    const caption = asString(content.caption);
    const alt = asString(content.alt);

    const imageCol = (
      <figure className="overflow-hidden rounded-xl border border-black/10 bg-slate-50">
        {src && isImageUrl(src) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt || heading || ""} className="h-full max-h-[340px] w-full object-cover" />
        ) : (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-black/40">
            <ImageIcon size={28} />
            <span>Add an image URL</span>
          </div>
        )}
        {caption ? (
          <figcaption className="border-t border-black/10 px-3 py-2 text-xs text-black/50">{caption}</figcaption>
        ) : null}
      </figure>
    );

    const textCol = (
      <div className="flex flex-col justify-center gap-3">
        {heading ? <h3 className="text-xl font-semibold leading-snug text-ink">{heading}</h3> : null}
        {body ? <FormattedText text={body} /> : <p className="text-sm text-black/40">Add supporting text.</p>}
      </div>
    );

    return (
      <div className="grid items-start gap-5 sm:grid-cols-2">
        {imageRight ? <>{textCol}{imageCol}</> : <>{imageCol}{textCol}</>}
      </div>
    );
  }

  if (block.block_type === "AUDIO") {'''

marker = '  if (block.block_type === "AUDIO") {'
idx = text.find(marker)
if idx == -1:
    print("ERROR: Could not find AUDIO block in LessonBlockPreview.tsx")
    sys.exit(1)
text = text[:idx] + image_text_renderer + '\n' + text[idx + len(marker):]
open(path, 'w').write(text)
print("✓ LessonBlockPreview.tsx: added IMAGE_TEXT renderer")
PYEOF
fi

echo ""
echo "=== Done. Now run: npm run build ==="
