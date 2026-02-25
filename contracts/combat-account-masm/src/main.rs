use std::sync::Arc;
use std::{fs, path::PathBuf};

use combat_account_masm::compile_combat_component;
use miden_mast_package::{MastArtifact, Package, PackageKind, PackageManifest};
use miden_protocol::{
    assembly::Library,
    transaction::TransactionKernel,
    utils::serde::Serializable,
    vm::Program,
};

fn main() {
    let (component, library) = compile_combat_component();

    // --- Report library info ---
    let mut lib_bytes = Vec::new();
    library.write_into(&mut lib_bytes);
    let size_kb = lib_bytes.len() as f64 / 1024.0;
    println!("Combat account MASM library compiled successfully");
    println!("Library size: {:.1} KB ({} bytes)", size_kb, lib_bytes.len());

    let procs = component.get_procedures();
    println!("Exported procedures: {}", procs.len());
    for (digest, is_export) in &procs {
        println!("  proc: {:?} export={}", digest, is_export);
    }

    if lib_bytes.len() > 256 * 1024 {
        eprintln!("WARNING: Library exceeds 256KB limit!");
        std::process::exit(1);
    }
    println!("OK: Within 256KB limit");

    // --- Output directory ---
    let out_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("target/masm-combat");
    fs::create_dir_all(&out_dir).expect("failed to create output directory");

    // --- 1. Package combat account component as .masp ---
    let component_package = Package {
        name: "combat_account".to_string(),
        version: None,
        description: Some("MASM combat account component".to_string()),
        kind: PackageKind::AccountComponent,
        mast: MastArtifact::Library(Arc::new(library.clone())),
        manifest: PackageManifest::new(None),
        sections: vec![],
    };
    let component_path = out_dir.join("combat_account.masp");
    fs::write(&component_path, component_package.to_bytes())
        .expect("failed to write combat_account.masp");
    println!(
        "Wrote combat_account.masp ({:.1} KB)",
        fs::metadata(&component_path).unwrap().len() as f64 / 1024.0
    );

    // --- 2. Compile and package init_combat_note.masp ---
    let init_note_source = include_str!("../masm/init_combat_note.masm");
    let init_note_program = compile_note_program(&library, init_note_source, "init_combat_note");
    write_note_masp(&out_dir.join("init_combat_note.masp"), "init_combat_note", init_note_program);

    // --- 3. Compile and package submit_move_note.masp ---
    let submit_note_source = include_str!("../masm/submit_move_note.masm");
    let submit_note_program =
        compile_note_program(&library, submit_note_source, "submit_move_note");
    write_note_masp(
        &out_dir.join("submit_move_note.masp"),
        "submit_move_note",
        submit_note_program,
    );

    println!("\nAll .masp files written to: {}", out_dir.display());
}

/// Compile a MASM note script into a Program, with the combat library dynamically linked
/// so that `call.::nofile::proc_name` references resolve correctly.
fn compile_note_program(library: &Library, source: &str, name: &str) -> Program {
    let mut assembler = TransactionKernel::assembler();
    assembler
        .link_dynamic_library(library)
        .unwrap_or_else(|e| panic!("failed to link library for {name}: {e}"));

    let program = assembler
        .assemble_program(source)
        .unwrap_or_else(|e| panic!("failed to compile {name}: {e}"));

    let program_bytes = program.to_bytes();
    println!(
        "Compiled {name} ({:.1} KB)",
        program_bytes.len() as f64 / 1024.0
    );

    program
}

/// Write a compiled note script program as a .masp package.
fn write_note_masp(path: &std::path::Path, name: &str, program: Program) {
    let package = Package {
        name: name.to_string(),
        version: None,
        description: None,
        kind: PackageKind::NoteScript,
        mast: MastArtifact::Executable(Arc::new(program)),
        manifest: PackageManifest::new(None),
        sections: vec![],
    };
    let bytes = package.to_bytes();
    println!("Wrote {name}.masp ({:.1} KB)", bytes.len() as f64 / 1024.0);
    fs::write(path, bytes).unwrap_or_else(|e| panic!("failed to write {name}.masp: {e}"));
}
