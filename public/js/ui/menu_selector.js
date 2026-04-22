// public/js/ui/menu_selector.js
// public/js/ui/menu_selector.js
export function mountMenuSelector({
  listEl,
  portraitImgEl,
  portraitQEl,
  items,
  startIndex = 0,
  onConfirm = () => {}
}) {
  let idx = clamp(startIndex, 0, items.length - 1);

  function render() {
    listEl.innerHTML = "";

    items.forEach((it, i) => {
      const div = document.createElement("div");
      div.className = "menu-item" + (i === idx ? " is-active" : "");

      // allow either label (text) or labelHtml (rich)
      if (it && typeof it.labelHtml === "string") div.innerHTML = it.labelHtml;
      else div.textContent = it?.label ?? "";

      div.addEventListener("click", (e) => {
        // single click: select + confirm (unless disabled)
        idx = i;
        render();

        if (typeof it?.action === "function") {
          onConfirm(it, idx);
        }
        e.preventDefault();
      });

      listEl.appendChild(div);
    });

    syncPortrait();
  }

  function syncPortrait() {
    const it = items[idx];
    if (it?.img) {
      portraitImgEl.src = it.img;
      portraitImgEl.style.display = "block";
      if (portraitQEl) portraitQEl.style.display = "none";
    } else {
      // no portrait mode still works (caller may pass dummies)
      portraitImgEl.style.display = "none";
      if (portraitQEl) portraitQEl.style.display = "grid";
    }
  }

  function keyHandler(e) {
    // don’t hijack typing if you later add inputs
    const tag = (e.target?.tagName || "").toLowerCase();
    const isTyping = tag === "input" || tag === "textarea" || e.target?.isContentEditable;
    if (isTyping) return;

    if (e.key === "ArrowUp") {
      idx = (idx - 1 + items.length) % items.length;
      render();
      e.preventDefault();
    }
    if (e.key === "ArrowDown") {
      idx = (idx + 1) % items.length;
      render();
      e.preventDefault();
    }
    if (e.key === "Enter") {
      onConfirm(items[idx], idx);
      e.preventDefault();
    }
  }

  document.addEventListener("keydown", keyHandler);

  render();

  return {
    getIndex: () => idx,
    setIndex: (n) => { idx = clamp(n, 0, items.length - 1); render(); },
    destroy: () => document.removeEventListener("keydown", keyHandler)
  };
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
