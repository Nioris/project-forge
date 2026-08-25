# Godot 4 C# lane

Read this only when `forge.godot.json` selects `csharp`.

## Toolchain facts

- C# requires the .NET-enabled Godot editor; the standard editor is insufficient.
- A separate .NET SDK supplies MSBuild and the compiler. Record actual output from
  `godot --version`, `godot --help` and `dotnet --list-sdks`; never invent a compatible version.
- Let `check-godot-project.mjs` run Godot `--build-solutions`. A compiler error is a project defect;
  missing/incompatible SDK, hostfxr or .NET-enabled editor is an environment blocker.
- Godot 4 C# projects are native/desktop in this Forge profile. Do not promise Web export.

Official references:

- https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_basics.html
- https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
- https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html

## Source layout invariants

- Commit the generated `.csproj` and solution/workspace metadata required by the project.
- Ignore `.godot/`, `bin/` and `obj/`; they are generated state, not source evidence.
- An attached C# class name must match its filename.
- Keep scene/resource paths under the contract `projectPath`; never reference a sibling project or
  an absolute developer-machine path.
- Print the contract smoke marker from initialized production code, not from an editor plugin or test
  shim that does not run in the game.
