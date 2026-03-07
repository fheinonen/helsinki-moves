function createDropdownController({
  triggerEl,
  listEl,
  itemSelector = "li[role='option']",
  onSelect,
} = {}) {
  function getItems() {
    if (!listEl || typeof listEl.querySelectorAll !== "function") {
      return [];
    }
    return [...listEl.querySelectorAll(itemSelector)];
  }

  function setOpen(open) {
    const nextOpen = Boolean(open);
    triggerEl?.setAttribute?.("aria-expanded", String(nextOpen));
    listEl?.classList?.toggle?.("hidden", !nextOpen);
  }

  function isOpen() {
    return triggerEl?.getAttribute?.("aria-expanded") === "true";
  }

  function focusItem(nextIndex) {
    const items = getItems();
    if (items.length === 0) return;
    for (const item of items) {
      item.classList?.remove?.("is-focused");
    }
    const boundedIndex = nextIndex < 0 ? items.length - 1 : nextIndex % items.length;
    const nextItem = items[boundedIndex];
    nextItem.classList?.add?.("is-focused");
    nextItem.scrollIntoView?.({ block: "nearest" });
  }

  function selectFocused() {
    const items = getItems();
    const focused = items.find((item) => item.classList?.contains?.("is-focused"));
    const value = focused?.dataset?.value;
    if (!value || typeof onSelect !== "function") return;
    onSelect(value);
  }

  function handleKeyDown(event) {
    const key = String(event?.key || "");
    const items = getItems();
    const open = isOpen();

    if (key === "Escape") {
      setOpen(false);
      triggerEl?.focus?.();
      event?.preventDefault?.();
      return;
    }

    if (key === "Enter" || key === " ") {
      if (!open) {
        setOpen(true);
        focusItem(0);
      } else {
        selectFocused();
        setOpen(false);
      }
      event?.preventDefault?.();
      return;
    }

    if (key !== "ArrowDown" && key !== "ArrowUp") {
      return;
    }

    event?.preventDefault?.();
    if (!open) {
      setOpen(true);
      focusItem(key === "ArrowDown" ? 0 : items.length - 1);
      return;
    }

    const currentIndex = items.findIndex((item) => item.classList?.contains?.("is-focused"));
    const delta = key === "ArrowDown" ? 1 : -1;
    focusItem(currentIndex + delta);
  }

  return {
    getItems,
    handleKeyDown,
    isOpen,
    setOpen,
  };
}

module.exports = {
  createDropdownController,
};
