import type { Command, Option } from 'commander';

export interface DescribeOption {
  flags: string;
  description: string;
  defaultValue?: unknown;
}

export interface DescribeCommand {
  name: string;
  description: string;
  aliases: string[];
  options: DescribeOption[];
  commands: DescribeCommand[];
}

function describeOption(opt: Option): DescribeOption {
  const out: DescribeOption = {
    flags: opt.flags,
    description: opt.description,
  };
  if (opt.defaultValue !== undefined) {
    out.defaultValue = opt.defaultValue;
  }
  return out;
}

function describeCommand(cmd: Command): DescribeCommand {
  return {
    name: cmd.name(),
    description: cmd.description(),
    aliases: cmd.aliases(),
    options: cmd.options.map(describeOption),
    commands: cmd.commands.map(describeCommand),
  };
}

export function describeProgram(program: Command): DescribeCommand {
  return describeCommand(program);
}
