use crate::types::{MatchResult, VariableInfo};
use anyhow::Result;
use dialoguer::{theme::ColorfulTheme, Select};
use std::collections::HashMap;

pub fn match_variables(
    source_vars: &HashMap<String, VariableInfo>,
    obf_vars: &HashMap<String, VariableInfo>,
    high_threshold: f64,
    ambiguous_threshold: f64,
    no_match_threshold: f64,
    non_interactive: bool,
    verbose: bool,
) -> Result<MatchResult> {
    let mut result = MatchResult::new();

    for (obf_name, obf_var) in obf_vars {
        // Compute scores against all source variables
        let mut scores: Vec<(String, f64)> = source_vars
            .iter()
            .map(|(src_name, src_var)| {
                let score = obf_var.compute_similarity(src_var);
                (src_name.clone(), score)
            })
            .collect();

        // Sort by score descending
        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

        if verbose {
            println!("\n{} ({:?}):", obf_name, obf_var.var_type);
            for (name, score) in scores.iter().take(3) {
                println!("  {} -> {}: {:.3}", obf_name, name, score);
            }
        }

        if scores.is_empty() {
            if verbose {
                println!("  ⚠ No candidates found");
            }
            result.no_match += 1;
            continue;
        }

        let best_score = scores[0].1;
        let best_match = &scores[0].0;

        // Case 1: Score too low - no match
        if best_score < no_match_threshold {
            if verbose || !non_interactive {
                println!("  ⚠ No match found for '{}' (best score: {:.3})", obf_name, best_score);
            }
            result.no_match += 1;
            continue;
        }

        // Case 2: High confidence - auto-rename
        if best_score >= high_threshold {
            // Check if there are other close matches
            let close_matches: Vec<_> = scores
                .iter()
                .filter(|(_, score)| *score >= ambiguous_threshold && *score >= best_score * 0.9)
                .collect();

            if close_matches.len() == 1 {
                // Clear winner
                result.renames.insert(obf_name.clone(), best_match.clone());
                result.auto_renamed += 1;
                if verbose {
                    println!("  ✓ Auto-rename: {} -> {} (score: {:.3})", obf_name, best_match, best_score);
                }
                continue;
            }
        }

        // Case 3: Ambiguous or medium confidence - ask user (if interactive)
        if best_score >= ambiguous_threshold {
            let top_candidates: Vec<_> = scores
                .iter()
                .filter(|(_, score)| *score >= ambiguous_threshold)
                .take(5)
                .collect();

            if non_interactive {
                // In non-interactive mode, use best match
                result.renames.insert(obf_name.clone(), best_match.clone());
                result.auto_renamed += 1;
                if verbose {
                    println!("  → Using best match: {} -> {} (score: {:.3})", obf_name, best_match, best_score);
                }
            } else {
                // Ask user
                println!("\n🤔 Ambiguous match for '{}':", obf_name);
                
                let mut options: Vec<String> = top_candidates
                    .iter()
                    .map(|(name, score)| format!("{} (score: {:.3})", name, score))
                    .collect();
                options.push("Skip (keep obfuscated name)".to_string());

                let selection = Select::with_theme(&ColorfulTheme::default())
                    .with_prompt("Choose the best match")
                    .items(&options)
                    .default(0)
                    .interact()?;

                if selection < top_candidates.len() {
                    let chosen_name = top_candidates[selection].0.clone();
                    result.renames.insert(obf_name.clone(), chosen_name.clone());
                    result.user_selected += 1;
                    println!("  ✓ Selected: {} -> {}", obf_name, chosen_name);
                } else {
                    println!("  ⊗ Skipped: {}", obf_name);
                    result.no_match += 1;
                }
            }
        } else {
            // Score below ambiguous threshold but above no-match
            if verbose || !non_interactive {
                println!("  ⚠ Low confidence for '{}' (best: {} at {:.3})", 
                    obf_name, best_match, best_score);
            }
            result.no_match += 1;
        }
    }

    Ok(result)
}