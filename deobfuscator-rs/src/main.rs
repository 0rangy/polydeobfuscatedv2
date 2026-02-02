use anyhow::{Context, Result};
use clap::Parser;
use std::path::PathBuf;

mod analyzer;
mod ast_navigator;
mod matcher;
mod renamer;
mod types;

use analyzer::analyze_file_with_path;
use matcher::match_variables;
use renamer::apply_renames;

#[derive(Parser, Debug)]
#[command(name = "js-deobfuscator")]
#[command(about = "JavaScript deobfuscation tool using similarity scoring", long_about = None)]
struct Args {
    /// Source (deobfuscated) file
    #[arg(short, long)]
    source: PathBuf,

    /// Obfuscated file to deobfuscate
    #[arg(short, long)]
    obfuscated: PathBuf,

    /// Output file path
    #[arg(short = 'O', long, default_value = "out.js")]
    output: PathBuf,

    /// AST path to extract from obfuscated file (e.g., "body.0.expression.callee.body.body.2.expression.expressions.15.callee.body")
    #[arg(long)]
    obf_ast_path: Option<String>,

    /// AST path to extract from source file (optional, defaults to root)
    #[arg(long)]
    source_ast_path: Option<String>,

    /// High confidence threshold for auto-rename (0.0-1.0)
    #[arg(long, default_value = "0.75")]
    high_threshold: f64,

    /// Ambiguous threshold for asking user (0.0-1.0)
    #[arg(long, default_value = "0.65")]
    ambiguous_threshold: f64,

    /// No match threshold - below this = new variable (0.0-1.0)
    #[arg(long, default_value = "0.45")]
    no_match_threshold: f64,

    /// Verbose output
    #[arg(short, long)]
    verbose: bool,

    /// Non-interactive mode (skip user prompts, use best match)
    #[arg(long)]
    non_interactive: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();

    if args.verbose {
        println!("Analyzing source file: {:?}", args.source);
        if let Some(ref path) = args.source_ast_path {
            println!("  Using AST path: {}", path);
        }
    }

    // Parse and analyze source file
    let source_code = std::fs::read_to_string(&args.source)
        .context("Failed to read source file")?;
    let source_vars = analyze_file_with_path(&source_code, args.source_ast_path.as_deref(), args.verbose)?;

    if args.verbose {
        println!("Found {} variables in source", source_vars.len());
        println!("\nAnalyzing obfuscated file: {:?}", args.obfuscated);
        if let Some(ref path) = args.obf_ast_path {
            println!("  Using AST path: {}", path);
        }
    }

    // Parse and analyze obfuscated file
    let obf_code = std::fs::read_to_string(&args.obfuscated)
        .context("Failed to read obfuscated file")?;
    let obf_vars = analyze_file_with_path(&obf_code, args.obf_ast_path.as_deref(), args.verbose)?;

    if args.verbose {
        println!("Found {} variables in obfuscated file", obf_vars.len());
        println!("\nMatching variables...");
    }

    // Match variables between source and obfuscated
    let matches = match_variables(
        &source_vars,
        &obf_vars,
        args.high_threshold,
        args.ambiguous_threshold,
        args.no_match_threshold,
        args.non_interactive,
        args.verbose,
    )?;

    // Apply renames
    let output_code = apply_renames(&obf_code, &matches)?;

    // Write output
    std::fs::write(&args.output, output_code)
        .context("Failed to write output file")?;

    println!("\n✓ Deobfuscated code written to {:?}", args.output);
    println!("  - Auto-renamed: {}", matches.auto_renamed);
    println!("  - User-selected: {}", matches.user_selected);
    println!("  - No match found: {}", matches.no_match);

    Ok(())
}