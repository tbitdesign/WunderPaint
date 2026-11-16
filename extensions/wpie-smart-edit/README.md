# Smart Edit

Smart Edit discovers visual families in the open document. Explore actual document previews, highlight related objects and modify their appearance together. Choose a whole font or shape family, or one of its recognized style variations. Color families use WunderPaint's existing color-carrier engine, including gradients and effects.

The catalog (1.2) shows the document the way a designer reads it. Text is grouped by its role - Headlines, Subheadings, Body text and Small text, judged against the size most of the reading happens in - and each exact style inside a role is a variation. Colors form families of lighter and darker tones of one hue (near-identical greys count as one); choosing a new color for the family moves every tone with it and keeps its distance in hue, saturation and lightness, and every single tone stays reachable as a variation. Shapes group by how they look - form, corners, whether there is an outline, effects - not by size, color, outline width or opacity, which are what one changes together; sizes become variations only where a size repeats. Families of a single object wait folded below what repeats. The data-level families (fonts, shape types, single colors) remain the basis of explorations and relations.

Layer > Smart Edit: Related Objects opens the dialog on the active object, already exploring what belongs to it. Select in document hands the chosen family, without its exclusions, to the editor as a selection for the usual tools; it waits until pending changes are applied or reset.

Click an editable object in Explore objects mode to discover its related families. Suggestions include matching typography across different colors, small typography size differences, equal font sizes, matching shape appearance across different dimensions and nearby colors. Hover a suggestion to inspect its members. Show all families returns to the full catalog while keeping staged changes. Include / exclude mode adjusts membership in the preview; the object list also supports individual exclusions.

Numeric properties support Set to, Add and Change %. Relative changes preserve each member's own value, including individually formatted text passages. Enter a negative adjustment to reduce a value. Switching modes or clearing a numeric field removes that field's pending adjustment. Preview passes always start from the original document, so repeating a preview does not compound an adjustment.

The Changes list keeps pending properties visible across families. Switch an individual property off to compare its effect, switch it back on or remove it. Linked width and height retain each shape's own proportions and center, including when family members have different dimensions. Dimension fields use a compact display while unchanged geometry retains its precision.

Choose close or broader similarity when exploring an example. Existing changes and exclusions keep the matches they were created with; exploring a broader suggestion does not extend an earlier edit. Zoom to a family's included matches or to one member from the object list.

Copy from example accepts an editable object picked on the canvas or from the example selector. Transfer typography from a chosen text passage, or a shape's fill, stroke paint and width, or corners. The example is captured from the preview when selected. This reuses the editor's style snapshot logic without changing the shared clipboard. Transfers respect the target family's scope, text passages and exclusions, and remain pending until Apply changes.

Text changes can target matching styled passages or entire text layers. Related labels and background shapes can resize together while preserving their spacing. A recognized numeric row or grid with an unambiguous highlight can transfer its marker and foreground color to another number. Previously saved ordinary text colors are retained for later transfers.

All edits remain in the dialog preview until Apply changes. Original comparison, per-object inclusion and exclusion, Whole Document and Selection scopes, and resetting individual families are available. Applying creates a single undo step. Changes to the document while the dialog is open require refreshing the analysis.

Locked and hidden branches, generator content, smart-object contents and image pixels keep their existing editing workflows. Recognition of labels and highlights is deliberately limited to clear, editable arrangements; the extension does not infer missing objects from flattened images. Recognition and editing run locally without AI requests.

## Development

Run `npm ci`, `npm run build` and `npm test` in this folder, with the core repository's development dependencies installed. The bundle reuses the core's text-run, text-measurement, color-carrier, color-link and repeat-layout modules at build time. Tests bundle these same sources and cover recognition, partial text formatting, scope, protected content, color swaps, linked colors, compound edits and stale-document protection. DOM tests exercise the real shared UI builders with substituted raster and picker boundaries. They do not verify the editor's visual rendering.
