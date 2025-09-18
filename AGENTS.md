agents-doc folder contains:
-documentation for bun (/bun/)
-codebase for opentui (/opentui/) (for making TUI using JS/TS)
    *in opentui there is the packages/core which contains the core library and examples,
     there is also packages/react which contains the react instructions and examples which are to be used to make TUIs using react
    *theres also vue, solid, go - but will primarily defailt to react unless asked.
-codebase for qflow (/qflow/) (workflow automation - consult its README.md)
    *in qflow there is examples/ which contains various example implementations using qflow
     src/qflow.js which is core logic
     src/nodes/ containing integrations logic
     src/agents containing agents logic
    *note that when referencing from examples, do not use the import statements as is in those examples use them as in the README.md
