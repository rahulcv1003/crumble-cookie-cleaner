/** Modal confirmation built on <dialog>. Buttons say what happens (PRD "Writing in the UI"). */
import { h } from "./dom";

export function confirmDialog(opts: { title: string; body: (Node | string)[]; confirm: string; cancel: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = h("dialog", { "aria-labelledby": "dlg-title" });
    const done = (ok: boolean) => {
      dlg.close();
      dlg.remove();
      resolve(ok);
    };
    dlg.append(
      h("h3", { id: "dlg-title" }, opts.title),
      ...opts.body.map((b) => (typeof b === "string" ? h("p", {}, b) : b)),
      h("div", { class: "buttons" },
        h("button", { class: "btn", onclick: () => done(false) }, opts.cancel),
        h("button", { class: `btn primary${opts.danger ? " danger" : ""}`, "data-confirm": "", onclick: () => done(true) }, opts.confirm),
      ),
    );
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.append(dlg);
    dlg.showModal();
    (dlg.querySelector("[data-confirm]") as HTMLButtonElement).focus();
  });
}
