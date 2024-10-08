type CommandLineArguments = { // Example: "-switchA --key=value argA argB -switchB --key="space seperate"
    args: string[]; // argA, argB
    switch: string[]; // switchA, switchB
    named: { [key: string]: string | undefined } // { key: value }
}
export function parse(params: string[]): CommandLineArguments {
    const cmp: CommandLineArguments = { args: [], switch: [], named: {}};
    for (const param of params) {
        if (param.startsWith('--')) {
            let [ key, value ] = param.split('=', 2);
            if (value.startsWith('"') || value.endsWith('"'))
                value.slice(1, -1)
            cmp.named[key.substring(2)] = value;
        }
        else
        if (param.startsWith('-')) {
            cmp.switch.push(param.substring(1));
        }
        else {
            cmp.args.push(param);
        }
    }
    return cmp;
}