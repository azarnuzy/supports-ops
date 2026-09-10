export type MessageSampleProps = {
  kind: "customer" | "ai" | "human" | "error";
  name: string;
  text: string;
};
