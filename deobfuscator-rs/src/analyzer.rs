use crate::types::{UsagePattern, VarType, VariableInfo};
use anyhow::Result;
use oxc::{
    allocator::Allocator,
    ast::ast::*,
    ast_visit::{walk, Visit},
    parser::Parser,
    span::SourceType,
    syntax,
};
use std::collections::{HashMap, HashSet};

struct VariableCollector {
    variables: HashMap<String, VariableInfo>,
    scope_head: usize,
    scope_id: usize,
    scope_stack: Vec<usize>,
}

impl VariableCollector {
    fn new() -> Self {
        Self {
            variables: HashMap::new(),
            scope_head: 0,
            scope_id: 0,
            scope_stack: Vec::new(),
        }
    }
}

impl<'a> Visit<'a> for VariableCollector {
    fn enter_scope(
        &mut self,
        _flags: syntax::scope::ScopeFlags,
        _scope_id: &std::cell::Cell<Option<syntax::scope::ScopeId>>,
    ) {
        self.scope_head += 1;
        self.scope_id = self.scope_head;
        self.scope_stack.push(self.scope_id);
    }

    fn leave_scope(&mut self) {
        self.scope_stack.pop();
        self.scope_id = *self.scope_stack.last().unwrap_or(&0);
    }

    fn visit_assignment_expression(&mut self, expr: &AssignmentExpression<'a>) {
        // Check if left side is a simple identifier we're tracking
        if let AssignmentTarget::AssignmentTargetIdentifier(id) = &expr.left {
            let name = id.name.to_string();
            if let Some(var) = self.variables.get_mut(&name) {
                var.usage.assigned += 1;
            }
        }
        
        walk::walk_assignment_expression(self, expr);
    }

    fn visit_call_expression(&mut self, expr: &CallExpression<'a>) {
        // Check if callee is a simple identifier
        if let Expression::Identifier(id) = &expr.callee {
            let name = id.name.to_string();
            if let Some(var) = self.variables.get_mut(&name) {
                var.usage.called += 1;
            }
        }

        // Check arguments
        for arg in &expr.arguments {
            if let Argument::Identifier(id) = arg {
                let name = id.name.to_string();
                if let Some(var) = self.variables.get_mut(&name) {
                    var.usage.passed_as_arg += 1;
                }
            }
        }

        walk::walk_call_expression(self, expr);
    }

    fn visit_static_member_expression(&mut self, expr: &StaticMemberExpression<'a>) {
        // Get the object identifier
        if let Expression::Identifier(id) = &expr.object {
            let name = id.name.to_string();
            if let Some(var) = self.variables.get_mut(&name) {
                var.usage.used_as_object += 1;
                var.properties.insert(expr.property.name.to_string());
            }
        }

        walk::walk_static_member_expression(self, expr);
    }

    fn visit_update_expression(&mut self, expr: &UpdateExpression<'a>) {
        if let SimpleAssignmentTarget::AssignmentTargetIdentifier(id) = &expr.argument {
            let name = id.name.to_string();
            if let Some(var) = self.variables.get_mut(&name) {
                var.usage.updated += 1;
            }
        }
        
        walk::walk_update_expression(self, expr);
    }
}

fn get_var_type(init: Option<&Expression>) -> VarType {
    match init {
        None => VarType::Uninitialized,
        Some(Expression::StringLiteral(_)) => VarType::StringLiteral,
        Some(Expression::NumericLiteral(_)) => VarType::NumberLiteral,
        Some(Expression::BooleanLiteral(_)) => VarType::BooleanLiteral,
        Some(Expression::NullLiteral(_)) => VarType::NullLiteral,
        Some(Expression::Identifier(id)) if id.name == "undefined" => VarType::UndefinedLiteral,
        Some(Expression::ObjectExpression(_)) => VarType::ObjectExpression,
        Some(Expression::ArrayExpression(_)) => VarType::ArrayExpression,
        Some(Expression::FunctionExpression(_)) => VarType::FunctionExpression,
        Some(Expression::ArrowFunctionExpression(_)) => VarType::ArrowFunction,
        Some(Expression::ClassExpression(_)) => VarType::ClassExpression,
        Some(expr) => VarType::Other(format!("{:?}", expr).chars().take(20).collect()),
    }
}

pub fn analyze_statements(statements: &[Statement], verbose: bool) -> Result<HashMap<String, VariableInfo>> {
    let mut collector = VariableCollector::new();
    
    // Collect top-level declarations
    for stmt in statements {
        match stmt {
            Statement::VariableDeclaration(decl) => {
                for declarator in &decl.declarations {
                    if let BindingPattern::BindingIdentifier(id) = &declarator.id {
                        let name = id.name.to_string();
                        let var_type = get_var_type(declarator.init.as_ref());
                        
                        collector.variables.insert(
                            name.clone(),
                            VariableInfo {
                                name: name.clone(),
                                var_type,
                                decl_type: "variable".to_string(),
                                properties: HashSet::new(),
                                usage: UsagePattern::new(),
                            },
                        );
                    }
                }
            }
            Statement::FunctionDeclaration(func) => {
                if let Some(id) = &func.id {
                    let name = id.name.to_string();
                    collector.variables.insert(
                        name.clone(),
                        VariableInfo {
                            name: name.clone(),
                            var_type: VarType::FunctionExpression,
                            decl_type: "function".to_string(),
                            properties: HashSet::new(),
                            usage: UsagePattern::new(),
                        },
                    );
                }
            }
            Statement::ClassDeclaration(class) => {
                if let Some(id) = &class.id {
                    let name = id.name.to_string();
                    collector.variables.insert(
                        name.clone(),
                        VariableInfo {
                            name: name.clone(),
                            var_type: VarType::ClassExpression,
                            decl_type: "class".to_string(),
                            properties: HashSet::new(),
                            usage: UsagePattern::new(),
                        },
                    );
                }
            }
            _ => {}
        }
    }

    // Walk each statement
    for stmt in statements {
        collector.visit_statement(stmt);
    }

    if verbose {
        for (name, info) in &collector.variables {
            println!("  {} ({:?}): {} properties, {} usages",
                name,
                info.var_type,
                info.properties.len(),
                info.usage.assigned + info.usage.called + info.usage.passed_as_arg
            );
        }
    }

    Ok(collector.variables)
}

pub fn analyze_file(code: &str, verbose: bool) -> Result<HashMap<String, VariableInfo>> {
    let allocator = Allocator::default();
    let source_type = SourceType::mjs();
    let parser = Parser::new(&allocator, code, source_type);
    let result = parser.parse();

    if !result.errors.is_empty() {
        anyhow::bail!("Parse errors: {:?}",
            result.errors.iter().map(|e| e.to_string()).collect::<Vec<_>>()
        );
    }

    analyze_statements(&result.program.body, verbose)
}

pub fn analyze_file_with_path(code: &str, ast_path: Option<&str>, verbose: bool) -> Result<HashMap<String, VariableInfo>> {
    let allocator = Allocator::default();
    let source_type = SourceType::mjs();
    let parser = Parser::new(&allocator, code, source_type);
    let result = parser.parse();

    if !result.errors.is_empty() {
        anyhow::bail!("Parse errors: {:?}",
            result.errors.iter().map(|e| e.to_string()).collect::<Vec<_>>()
        );
    }

    let statements = if let Some(path) = ast_path {
        use crate::ast_navigator::navigate_to_statements;
        navigate_to_statements(&result.program, path)?
    } else {
        &result.program.body[..]
    };

    analyze_statements(statements, verbose)
}