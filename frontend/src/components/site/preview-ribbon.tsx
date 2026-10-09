export function PreviewRibbon() {
  return (
    <div
      role="note"
      className="glass-frosted pointer-events-none fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap text-ink shadow-elev-2"
    >
      <span aria-hidden className="mr-2 inline-block size-2 rounded-full bg-amber" />
      Preview: not yet public
    </div>
  );
}
