use oxc::ast::ast::*;
use anyhow::{Result, bail};

pub fn navigate_to_statements<'a>(program: &'a Program<'a>, path: &str) -> Result<&'a [Statement<'a>]> {
    if path.is_empty() {
        return Ok(&program.body);
    }

    let parts: Vec<&str> = path.split('.').collect();
    navigate_recursive(&program.body, &parts, 0)
}

fn navigate_recursive<'a>(statements: &'a [Statement<'a>], parts: &[&str], index: usize) -> Result<&'a [Statement<'a>]> {
    if index >= parts.len() {
        return Ok(statements);
    }

    let part = parts[index];

    // Handle array index
    if let Ok(idx) = part.parse::<usize>() {
        if idx >= statements.len() {
            bail!("Index {} out of bounds (length: {})", idx, statements.len());
        }
        return navigate_statement(&statements[idx], parts, index + 1);
    }

    // Handle property access
    match part {
        "body" => {
            if index + 1 >= parts.len() {
                return Ok(statements);
            }
            // Next part should be an index
            navigate_recursive(statements, parts, index + 1)
        }
        _ => bail!("Unknown path part: {}", part),
    }
}

fn navigate_statement<'a>(stmt: &'a Statement<'a>, parts: &[&str], index: usize) -> Result<&'a [Statement<'a>]> {
    if index >= parts.len() {
        bail!("Path ended at statement, expected to reach body");
    }

    let part = parts[index];

    match part {
        "expression" => {
            if let Statement::ExpressionStatement(expr_stmt) = stmt {
                navigate_expression(&expr_stmt.expression, parts, index + 1)
            } else {
                bail!("Expected ExpressionStatement, got {:?}", stmt)
            }
        }
        _ => bail!("Unknown statement property: {}", part),
    }
}

fn navigate_expression<'a>(expr: &'a Expression<'a>, parts: &[&str], index: usize) -> Result<&'a [Statement<'a>]> {
    if index >= parts.len() {
        bail!("Path ended at expression, expected to reach body");
    }

    let part = parts[index];

    match part {
        "callee" => {
            if let Expression::CallExpression(call_expr) = expr {
                navigate_expression(&call_expr.callee, parts, index + 1)
            } else {
                bail!("Expected CallExpression, got expression")
            }
        }
        "body" => {
            if let Expression::FunctionExpression(func_expr) = expr {
                if let Some(body) = &func_expr.body {
                    navigate_recursive(&body.statements, parts, index + 1)
                } else {
                    bail!("Function has no body")
                }
            } else if let Expression::ArrowFunctionExpression(arrow_expr) = expr {
                // Arrow function body is always a FunctionBody in oxc
                navigate_recursive(&arrow_expr.body.statements, parts, index + 1)
            } else {
                bail!("Expected FunctionExpression or ArrowFunctionExpression")
            }
        }
        "expressions" => {
            if let Expression::SequenceExpression(seq_expr) = expr {
                if index + 1 >= parts.len() {
                    bail!("Expected index after 'expressions'");
                }
                let idx_str = parts[index + 1];
                let idx: usize = idx_str.parse()
                    .map_err(|_| anyhow::anyhow!("Expected number after 'expressions', got {}", idx_str))?;
                
                if idx >= seq_expr.expressions.len() {
                    bail!("Expression index {} out of bounds", idx);
                }
                navigate_expression(&seq_expr.expressions[idx], parts, index + 2)
            } else {
                bail!("Expected SequenceExpression")
            }
        }
        _ => bail!("Unknown expression property: {}", part),
    }
}