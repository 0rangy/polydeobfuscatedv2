use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VarType {
    Uninitialized,
    StringLiteral,
    NumberLiteral,
    BooleanLiteral,
    NullLiteral,
    UndefinedLiteral,
    ObjectExpression,
    ArrayExpression,
    FunctionExpression,
    ArrowFunction,
    ClassExpression,
    Other(String),
}

impl VarType {
    pub fn similarity(&self, other: &VarType) -> f64 {
        match (self, other) {
            (VarType::Uninitialized, VarType::Uninitialized) => 1.0,
            (VarType::StringLiteral, VarType::StringLiteral) => 1.0,
            (VarType::NumberLiteral, VarType::NumberLiteral) => 1.0,
            (VarType::BooleanLiteral, VarType::BooleanLiteral) => 1.0,
            (VarType::NullLiteral, VarType::NullLiteral) => 1.0,
            (VarType::UndefinedLiteral, VarType::UndefinedLiteral) => 1.0,
            (VarType::ObjectExpression, VarType::ObjectExpression) => 1.0,
            (VarType::ArrayExpression, VarType::ArrayExpression) => 1.0,
            (VarType::FunctionExpression, VarType::FunctionExpression) => 1.0,
            (VarType::ArrowFunction, VarType::ArrowFunction) => 1.0,
            (VarType::ClassExpression, VarType::ClassExpression) => 1.0,
            // Function-like types are somewhat similar
            (VarType::FunctionExpression, VarType::ArrowFunction) => 0.8,
            (VarType::ArrowFunction, VarType::FunctionExpression) => 0.8,
            _ => 0.0,
        }
    }
}

#[derive(Debug, Clone)]
pub enum DeclarationType {
    Variable,
    Function,
    Class,
    Method,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsagePattern {
    pub assigned: usize,
    pub called: usize,
    pub passed_as_arg: usize,
    pub used_as_object: usize,
    pub used_as_property: usize,
    pub updated: usize,
}

impl UsagePattern {
    pub fn new() -> Self {
        Self {
            assigned: 0,
            called: 0,
            passed_as_arg: 0,
            used_as_object: 0,
            used_as_property: 0,
            updated: 0,
        }
    }

    pub fn similarity(&self, other: &UsagePattern) -> f64 {
        let total_self = self.total();
        let total_other = other.total();

        if total_self == 0 && total_other == 0 {
            return 1.0;
        }
        if total_self == 0 || total_other == 0 {
            return 0.0;
        }

        // Compare proportions of each usage type
        let mut score = 0.0;
        let count = 6.0;

        score += 1.0 - ((self.assigned as f64 / total_self as f64)
            - (other.assigned as f64 / total_other as f64))
            .abs();
        score += 1.0 - ((self.called as f64 / total_self as f64)
            - (other.called as f64 / total_other as f64))
            .abs();
        score += 1.0 - ((self.passed_as_arg as f64 / total_self as f64)
            - (other.passed_as_arg as f64 / total_other as f64))
            .abs();
        score += 1.0 - ((self.used_as_object as f64 / total_self as f64)
            - (other.used_as_object as f64 / total_other as f64))
            .abs();
        score += 1.0 - ((self.used_as_property as f64 / total_self as f64)
            - (other.used_as_property as f64 / total_other as f64))
            .abs();
        score += 1.0 - ((self.updated as f64 / total_self as f64)
            - (other.updated as f64 / total_other as f64))
            .abs();

        score / count
    }

    fn total(&self) -> usize {
        self.assigned
            + self.called
            + self.passed_as_arg
            + self.used_as_object
            + self.used_as_property
            + self.updated
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableInfo {
    pub name: String,
    pub var_type: VarType,
    pub decl_type: String, // "variable", "function", "class", "method"
    pub properties: HashSet<String>,
    pub usage: UsagePattern,
}

impl VariableInfo {
    pub fn compute_similarity(&self, other: &VariableInfo) -> f64 {
        // Weights for different features
        const TYPE_WEIGHT: f64 = 0.35;      // High weight: type matching
        const PROPERTY_WEIGHT: f64 = 0.35;  // High weight: property access
        const USAGE_WEIGHT: f64 = 0.20;     // Lower weight: usage patterns
        const DECL_WEIGHT: f64 = 0.10;      // Lower weight: declaration type

        let mut score = 0.0;

        // Type similarity
        score += self.var_type.similarity(&other.var_type) * TYPE_WEIGHT;

        // Property similarity (Jaccard index)
        let property_sim = if self.properties.is_empty() && other.properties.is_empty() {
            1.0
        } else {
            let intersection = self.properties.intersection(&other.properties).count();
            let union = self.properties.union(&other.properties).count();
            if union == 0 {
                0.0
            } else {
                intersection as f64 / union as f64
            }
        };
        score += property_sim * PROPERTY_WEIGHT;

        // Usage pattern similarity
        score += self.usage.similarity(&other.usage) * USAGE_WEIGHT;

        // Declaration type similarity
        let decl_sim = if self.decl_type == other.decl_type {
            1.0
        } else {
            0.0
        };
        score += decl_sim * DECL_WEIGHT;

        score
    }
}

#[derive(Debug, Clone)]
pub struct Match {
    pub obf_name: String,
    pub source_name: String,
    pub score: f64,
}

#[derive(Debug)]
pub struct MatchResult {
    pub renames: HashMap<String, String>,
    pub auto_renamed: usize,
    pub user_selected: usize,
    pub no_match: usize,
}

impl MatchResult {
    pub fn new() -> Self {
        Self {
            renames: HashMap::new(),
            auto_renamed: 0,
            user_selected: 0,
            no_match: 0,
        }
    }
}