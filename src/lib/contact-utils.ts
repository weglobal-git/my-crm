export function maskEmail(email: string | null): string | null {
  if (!email || !email.includes("@")) return email;
  const [user, domain] = email.split("@");
  if (user.length <= 2) return `**@${domain}`;
  return `${user.slice(0, 2)}***@${domain}`;
}

export function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length <= 4) return phone;
  const prefix = phone.slice(0, 3);
  const suffix = phone.slice(-3);
  return `${prefix}-***-${suffix}`;
}
