import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

export interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: "md" | "lg";
  children: ReactNode;
  footer?: ReactNode;
}

export function ModalDialog({
  open,
  onClose,
  title,
  subtitle,
  size = "md",
  children,
  footer,
}: ModalDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = "";
      onCloseRef.current();
    };

    dialog.addEventListener("close", handleClose);

    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };

      let pressedOutside = false;

      const onPointerDown = (e: PointerEvent) => {
        if (!dialog.open) {
          pressedOutside = false;
          return;
        }
        pressedOutside = isOutside(e);
      };

      const onPointerUp = (e: PointerEvent) => {
        if (dialog.open && pressedOutside && isOutside(e)) {
          dialog.close();
        }
        pressedOutside = false;
      };

      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);

      return () => {
        dialog.removeEventListener("close", handleClose);
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={size === "lg" ? "dm-dialog dm-dialog-lg" : "dm-dialog"}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <div className="dm-dialog-head">
        <div>
          <h2 id={titleId} className="dm-dialog-title">
            {title}
          </h2>
          {subtitle && <p className="dm-dialog-sub">{subtitle}</p>}
        </div>
        <button
          type="button"
          aria-label="বন্ধ করুন"
          onClick={() => dialogRef.current?.close()}
          className="dm-dialog-close"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="dm-dialog-body">{open ? children : null}</div>

      {open && footer ? <div className="dm-dialog-foot">{footer}</div> : null}
    </dialog>
  );
}
