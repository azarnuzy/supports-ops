import { stdin as input, stdout as output } from "node:process";
type Prompter = { question(prompt: string): Promise<string> };

export async function questionHidden(rl: Prompter, prompt: string) {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) return rl.question(prompt);

  return new Promise<string>((resolve) => {
    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";
    const onData = (key: string) => {
      if (key === "\u0003") process.exit(130);
      if (key === "\r" || key === "\n") {
        output.write("\n");
        input.setRawMode(false);
        input.off("data", onData);
        resolve(value);
      } else if (key === "\u007f") value = value.slice(0, -1);
      else value += key;
    };
    input.on("data", onData);
  });
}

export function assertPassword(password: string, confirmation: string) {
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (password !== confirmation) throw new Error("Passwords do not match.");
}
