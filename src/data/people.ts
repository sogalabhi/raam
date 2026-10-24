// Fictional people and vehicles for the demo.

export type Role = "Storekeeper" | "Technician" | "Service Manager";

export const STOREKEEPERS = ["Lakshmi N.", "Joseph D."] as const;
export const TECHNICIANS = ["Ravi K.", "Imran S.", "Suresh P.", "Anil M.", "Deepak R.", "Kiran T."] as const;
export const MANAGER = "Meera V.";
export const ADVISORS = ["Farah A.", "Vikram J.", "Nisha R."] as const;

export const USERS: { name: string; role: Role }[] = [
  { name: "Lakshmi N.", role: "Storekeeper" },
  { name: "Joseph D.", role: "Storekeeper" },
  { name: "Ravi K.", role: "Technician" },
  { name: "Meera V.", role: "Service Manager" },
];

export const MODELS = [
  "C 220d", "C 300", "E 200", "E 220d", "GLC 300", "GLC 220d", "GLE 300d", "GLS 450", "S 350d", "A 200 Limousine", "GLA 200",
] as const;

export const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).join("").replace(".", "").slice(0, 2).toUpperCase();
