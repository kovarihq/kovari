export interface InternalTestUser {
  email: string;
  prodEmail: string;
  role: "GENERAL" | "MATCHING" | "CHAT" | "GROUPS" | "EDGE_CASE" | "RETENTION";
}

export const INTERNAL_TEST_USERS: InternalTestUser[] = [
  { email: "testkovari1@gmail.com", prodEmail: "testkovari1@gmail.com", role: "GENERAL" },
  { email: "testkovari2@gmail.com", prodEmail: "testkovari2@gmail.com", role: "GENERAL" },
  { email: "testkovari3@gmail.com", prodEmail: "testkovari3@gmail.com", role: "GENERAL" },
  { email: "testkovari5@gmail.com", prodEmail: "testkovari5@gmail.com", role: "GENERAL" },
];
