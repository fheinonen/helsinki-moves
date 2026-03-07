function installMockProperty(target, propertyName, value) {
  if (!target || (typeof target !== "object" && typeof target !== "function")) {
    return false;
  }

  const key = String(propertyName || "").trim();
  if (!key) return false;

  try {
    target[key] = value;
  } catch {
    // Fall through to defineProperty.
  }

  try {
    if (target[key] === value) {
      return true;
    }
  } catch {
    // Fall through to defineProperty.
  }

  try {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  } catch {
    return false;
  }

  try {
    return target[key] === value;
  } catch {
    return false;
  }
}

module.exports = {
  installMockProperty,
  installMockPropertySource: `(${installMockProperty.toString()})`,
};
