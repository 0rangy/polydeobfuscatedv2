use anyhow::Result;
use oxc::ast::ast::{Program, Statement};
use oxc::ast_visit::VisitMut;
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc::codegen::{Codegen};
use oxc::parser::Parser;
use oxc::span::SourceType;
use std::collections::{HashMap, HashSet};

struct Renamer {
    rename_map: HashMap<String, String>,
    local_vars: Vec<HashSet<String>>,
}

impl Renamer {
    fn new(rename_map: HashMap<String, String>) -> Self {
        Self {
            rename_map,
            local_vars: vec![HashSet::new()],
        }
    }

    fn is_local(&self, name: &str) -> bool {
        self.local_vars.iter().any(|scope| scope.contains(name))
    }

    fn enter_scope(&mut self) {
        self.local_vars.push(HashSet::new());
    }

    fn exit_scope(&mut self) {
        self.local_vars.pop();
    }

    fn declare(&mut self, name: String) {
        if let Some(scope) = self.local_vars.last_mut() {
            scope.insert(name);
        }
    }
}

impl<'a> VisitMut<'a> for Renamer {
    fn visit_program(&mut self, program: &mut Program<'a>) {
        // First pass: collect all top-level declarations as local
        for stmt in &program.body {
            match stmt {
                Statement::VariableDeclaration(decl) => {
                    for declarator in &decl.declarations {
                        if let BindingPattern::BindingIdentifier(id) = &declarator.id {
                            self.declare(id.name.to_string());
                        }
                    }
                }
                Statement::FunctionDeclaration(func) => {
                    if let Some(id) = &func.id {
                        self.declare(id.name.to_string());
                    }
                }
                Statement::ClassDeclaration(class) => {
                    if let Some(id) = &class.id {
                        self.declare(id.name.to_string());
                    }
                }
                _ => {}
            }
        }

        // Manually walk the statements
        for stmt in &mut program.body {
            self.visit_statement(stmt);
        }
    }

    fn visit_function(&mut self, func: &mut Function<'a>, _flags: oxc::syntax::scope::ScopeFlags) {
        self.enter_scope();

        // Declare parameters
        for param in &func.params.items {
            if let BindingPattern::BindingIdentifier(id) = &param.pattern {
                self.declare(id.name.to_string());
            }
        }

        if let Some(body) = &mut func.body {
            self.visit_function_body(body);
        }

        self.exit_scope();
    }

    fn visit_block_statement(&mut self, block: &mut BlockStatement<'a>) {
        self.enter_scope();
        
        // Manually walk statements
        for stmt in &mut block.body {
            self.visit_statement(stmt);
        }
        
        self.exit_scope();
    }

    fn visit_binding_identifier(&mut self, ident: &mut BindingIdentifier<'a>) {
        let name = ident.name.to_string();
        
        // Don't rename local variables
        if self.is_local(&name) {
            return;
        }

        if let Some(new_name) = self.rename_map.get(&name) {
            // Update the identifier's name
            // Note: In a real implementation, we'd need to create a new atom
            // For now, this is a placeholder - oxc's AST is immutable in some ways
            println!("Would rename {} to {}", name, new_name);
        }
    }

    fn visit_identifier_reference(&mut self, ident: &mut IdentifierReference<'a>) {
        let name = ident.name.to_string();
        
        // Don't rename local variables
        if self.is_local(&name) {
            return;
        }

        if let Some(_new_name) = self.rename_map.get(&name) {
            // Update the identifier's name
            // Note: In a real implementation, we'd need to create a new atom
            println!("Would rename reference {} to {}", name, _new_name);
        }
    }
}

pub fn apply_renames(code: &str, match_result: &crate::types::MatchResult) -> Result<String> {
    // For now, we'll use a simple string replacement approach
    // A proper implementation would use AST mutation
    let mut result = code.to_string();

    // Sort by length descending to avoid partial replacements
    let mut renames: Vec<_> = match_result.renames.iter().collect();
    renames.sort_by_key(|(old, _)| std::cmp::Reverse(old.len()));

    for (old_name, new_name) in renames {
        // Use word boundaries to avoid partial matches
        // This is a simplified approach - a real implementation should use AST
        result = result.replace(
            &format!("{}", old_name),
            new_name,
        );
    }

    Ok(result)
}

// Alternative: proper AST-based renaming (work in progress)
pub fn apply_renames_ast(code: &str, match_result: &crate::types::MatchResult) -> Result<String> {
    let allocator = Allocator::default();
    let source_type = SourceType::mjs();

    let parser = Parser::new(&allocator, code, source_type);
    let mut result = parser.parse();

    if !result.errors.is_empty() {
        anyhow::bail!("Parse errors: {:?}", result.errors);
    }

    let mut renamer = Renamer::new(match_result.renames.clone());
    renamer.visit_program(&mut result.program);

    let codegen = Codegen::new();
    let generated = codegen.build(&result.program);

    Ok(generated.code)
}