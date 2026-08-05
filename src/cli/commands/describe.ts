import type { Argument, Command, Option } from 'commander';

export interface DescribeOption {
  flags: string;
  description: string;
  defaultValue?: unknown;
}

export interface DescribeArgument {
  name: string;
  required: boolean;
}

export interface DescribeCommand {
  name: string;
  description: string;
  aliases: string[];
  /** Positional arguments, in declaration order. */
  arguments: DescribeArgument[];
  options: DescribeOption[];
  commands: DescribeCommand[];
  /**
   * Omitted from `--help`. Hidden commands are part of the parsed surface but
   * not the documented one, so a consumer can skip them without knowing their
   * names.
   */
  hidden: boolean;
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

function describeArgument(arg: Argument): DescribeArgument {
  return { name: arg.name(), required: arg.required };
}

/**
 * Names the parent lists in `--help`. Commander adds an implicit `help` entry
 * that is not among the parent's registered commands, so membership is compared
 * by name rather than by identity.
 */
function visibleChildNames(cmd: Command): Set<string> {
  return new Set(
    cmd
      .createHelp()
      .visibleCommands(cmd)
      .map((child) => child.name())
  );
}

function describeCommand(cmd: Command, hidden: boolean): DescribeCommand {
  const visible = visibleChildNames(cmd);
  return {
    name: cmd.name(),
    description: cmd.description(),
    aliases: cmd.aliases(),
    arguments: cmd.registeredArguments.map(describeArgument),
    options: cmd.options.map(describeOption),
    commands: cmd.commands.map((child) =>
      describeCommand(child, !visible.has(child.name()))
    ),
    hidden,
  };
}

export function describeProgram(program: Command): DescribeCommand {
  return describeCommand(program, false);
}
