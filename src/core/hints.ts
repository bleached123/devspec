import chalk from "chalk";

export function nextStep(content: string): void {
  console.log(chalk.dim("↳ next: ") + content);
}

export function cmd(text: string): string {
  return chalk.cyan(text);
}
