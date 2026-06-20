export const getUserInitials = (fullName: string, maxInitials = 2): string => {
  if (!fullName || typeof fullName !== "string") return "";

  const words = fullName.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "";

  const initials = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];

  return initials
    .slice(0, maxInitials)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
};
