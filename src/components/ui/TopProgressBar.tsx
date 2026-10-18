/** CSS-only indeterminate progress: no animation library or interval on startup. */
export default function TopProgressBar() {
  return (
    <div role="progressbar" aria-label="Đang tải trang" className="fixed top-0 left-0 right-0 h-[3px] overflow-hidden bg-primary/20 z-99999 pointer-events-none">
      <div className="h-full w-1/4 bg-primary animate-[route-progress_1.2s_ease-in-out_infinite] motion-reduce:animate-none" />
    </div>
  );
}
