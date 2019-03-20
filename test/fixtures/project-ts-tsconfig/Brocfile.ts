import { BrocfileOptions } from "options"; // "baseUrl" in tsconfig is relative to "src"

export default (options: BrocfileOptions) => options.env;
