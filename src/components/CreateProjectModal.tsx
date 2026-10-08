import { useEffect, useId, useRef, useState } from "react";

export function CreateProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const trimmed = name.trim();

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const finish = () => {
    if (!trimmed) return;
    onCreate(trimmed);
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-step">
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-head">
          <h2 id={titleId}>Create project</h2>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            finish();
          }}
        >
          <label className="modal-field">
            <span>Name</span>
            <input value={name} autoFocus placeholder="Warehouse floor" onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="modal-actions">
            <button type="button" className="text-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="start" disabled={!trimmed}>
              Create project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
