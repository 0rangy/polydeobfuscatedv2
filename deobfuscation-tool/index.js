const fs = require('fs');
const acorn = require('acorn');
const walk = require('acorn-walk');
const crypto = require('crypto');
const { MagicString } = require('magic-string');


let verbose = false;
let inFile = null;
let inObfuscated = null;
let outFile = "out.js"

for(let i = 3; i < process.argv.length; i++) {
    if(process.argv[i].startsWith('-v')) {
        verbose = true;
        continue;
    }
    // Merge subcommand arguments
    if(process.argv[2] === "m") {
        if(process.argv[i].startsWith('-o')) {
            obfFile = process.argv[i+1];
        } else {
            typeof inFile !== "string" ? inFile = process.argv[i] : inObfuscated = process.argv[i];
        }
    }
}
console.log({verbose, inFile, inObfuscated, outFile})


/**
 * Hash a JS value (stringified) with SHA-1 and return hex.
 */
function hashString(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

function normalizeNode(node) {
  if (node == null) return node;
  if (Array.isArray(node)) return node.map(normalizeNode);
  if (typeof node !== "object") return node;

  const out = {};
  const keys = Object.keys(node).sort();

  for (const k of keys) {
    if (["start","end","loc","raw"].includes(k)) continue;
    const v = node[k];

    if (node.type === "Identifier" && k === "name") {
      out[k] = "_";
      continue;
    }

    out[k] = normalizeNode(v);
  }

  return out;
}

function fingerprintNode(node) {
  const normalized = normalizeNode(node);
  return hashString(JSON.stringify(normalized));
}

/**
 * Build a usage signature for variables:
 * - Collect a set of usage types (assigned, read, called, passed, member-object, member-property)
 * - Collect property-access keys used as `obj.prop` when object is this variable (list sorted)
 *
 * Returns an object { usageTypes: [..], props: [..], counts: {..} } that is later hashed.
 */
function buildVariableUsageSignature(ast, varName) {
  const usageTypes = new Set();
  const props = new Set();
  const counts = {};

  // We need an ancestor walker to know parent nodes
  walk.ancestor(ast, {
    Identifier(node, ancestors) {
      if (node.name !== varName) return;
      const parent = ancestors[ancestors.length - 2];

      if (!parent) return;

      let kind = parent.type;
      // refine a few cases
      if (parent.type === "AssignmentExpression") {
        if (parent.left === node) {
          usageTypes.add("assigned");
          kind = "assigned";
        } else {
          usageTypes.add("used-in-assignment");
        }
      } else if (parent.type === "UpdateExpression") {
        usageTypes.add("updated");
      } else if (parent.type === "CallExpression") {
        if (parent.callee === node) usageTypes.add("called");
        else usageTypes.add("passed-as-arg");
      } else if (parent.type === "MemberExpression") {
        // node is either object or property
        if (parent.object === node) {
          usageTypes.add("object");
          // if property is an Identifier and not computed, collect property name
          if (!parent.computed && parent.property && parent.property.type === "Identifier") {
            props.add(parent.property.name);
          }
        } else if (parent.property === node) {
          usageTypes.add("property");
        }
      } else {
        usageTypes.add(parent.type);
      }

      counts[kind] = (counts[kind] || 0) + 1;
    }
  });

  const signature = {
    usage: Array.from(usageTypes).sort(),
    props: Array.from(props).sort(),
    counts,
  };
  return signature;
}

/**
 * Find top-level variables, functions, and classes and build an index.
 *
 * index = {
 *   variables: Map<fingerprint, { name, node, signature }>,
 *   functions: Map<fingerprint, { name, node }>,
 *   classes: Map<fingerprint, { name, node, methodFingerprints: {...} }>
 * }
 */
function buildIndexFromCode(ast, top) {
  const index = {
    variables: new Map(),
    functions: new Map(),
    classes: new Map(),
  };

  const tempVarMap = new Map(); // reserved temp vars (px/py/pz style)

  function addToMap(map, fp, entry, isTemp=false) {
    if (!map.has(fp)) map.set(fp, []);
    map.get(fp).push(entry);
    if (isTemp) tempVarMap.set(entry.name, true);
  }

  function buildUsageSignatureFor(name) {
    const usage = buildVariableUsageSignature(ast, name);
    return hashString(JSON.stringify(usage));
  }

  function combineFingerprint(contentFp, usageFp) {
    return hashString(contentFp + "|" + usageFp);
  }

  // --- VARIABLES ---
  for (const node of top) {
    if (node.type !== "VariableDeclaration") continue;

    for (const decl of node.declarations) {
      if (!decl.id || decl.id.type !== "Identifier") continue;
      const name = decl.id.name;
      const usageFp = buildUsageSignatureFor(name);

      let contentFp = "";
      if (decl.init) {
        if (["ArrowFunctionExpression","FunctionExpression"].includes(decl.init.type)) {
          contentFp = fingerprintNode(decl.init.body);
        } else if (decl.init.type === "ClassExpression") {
          const methods = [];
          for (const el of decl.init.body.body || []) {
            if (el.type === "MethodDefinition") {
              methods.push(fingerprintNode(el.value.body || el.value));
            }
          }
          methods.sort();
          contentFp = hashString(JSON.stringify(methods));
        } else {
          contentFp = fingerprintNode(decl.init);
        }
      }

      const combinedFp = combineFingerprint(contentFp, usageFp);

      // --- TEMP VAR DETECTION ---
      const isTemp = /^p[x|y|z]$/i.test(name) && decl.init?.type === "NewExpression";
      addToMap(index.variables, combinedFp, { name, node }, isTemp);
    }
  }

  // --- FUNCTIONS ---
  for (const node of top) {
    if (node.type !== "FunctionDeclaration" || !node.id) continue;
    const name = node.id.name;
    const usageFp = buildUsageSignatureFor(name);
    const contentFp = fingerprintNode(node.body);
    const combinedFp = combineFingerprint(contentFp, usageFp);
    addToMap(index.functions, combinedFp, { name, node });
  }

  // --- CLASSES ---
  for (const node of top) {
    if (node.type !== "ClassDeclaration" || !node.id) continue;
    const name = node.id.name;
    const usageFp = buildUsageSignatureFor(name);

    const methodMap = [];
    for (const el of node.body.body || []) {
      if (el.type === "MethodDefinition") {
        methodMap.push(fingerprintNode(el.value.body || el.value));
      }
    }
    methodMap.sort();
    const contentFp = hashString(JSON.stringify(methodMap));

    const combinedFp = combineFingerprint(contentFp, usageFp);
    addToMap(index.classes, combinedFp, { name, node });
  }

  return { index, tempVarMap };
}


/**
 * findMatches(indexA, indexB)
 * - indexA: deob index (Map fingerprints -> [{ name, node, ... }])
 * - indexB: obf index (same shape)
 *
 * Returns matches in the shape:
 * { variables: [{ deobName, obfName, fingerprint }], functions: [...], classes: [...] }
 */
function findMatches(indexAObj, indexBObj) {
  const { index: indexA, tempVarMap } = indexAObj;
  const { index: indexB } = indexBObj;

  const matches = { variables: [], functions: [], classes: [] };
  const getEntries = (map, fp) => (map.has(fp) ? map.get(fp).slice() : []);
  const entryPos = (entry) => (entry?.node?.start ?? 0);

  function disambiguate(fp, entriesA, entriesB, category) {
    entriesA.sort((a,b)=>entryPos(a)-entryPos(b));
    entriesB.sort((a,b)=>entryPos(a)-entryPos(b));
    const n = Math.min(entriesA.length, entriesB.length);
    return Array.from({length:n}, (_,i)=>({
      deobName: entriesA[i].name,
      obfName: entriesB[i].name,
      fingerprint: fp,
      category,
    }));
  }

  for (const cat of ["variables","functions","classes"]) {
    const mapA = indexA[cat], mapB = indexB[cat];
    if (!mapA || !mapB) continue;

    for (const [fp, entriesA] of mapA.entries()) {
      // TEMP VAR RESERVATION: if a temp var, reserve one-to-one first
      const isTemp = entriesA.some(e => tempVarMap.has(e.name));
      let entriesB = getEntries(mapB, fp);
      if (isTemp) {
        if (entriesA.length === 1 && entriesB.length === 1) {
          matches[cat].push({ deobName: entriesA[0].name, obfName: entriesB[0].name, fingerprint: fp });
          continue;
        }
      }

      // fallback: usage only
      if (!entriesB.length) {
        const usageOnlyMapB = new Map();
        for (const [fpB, entries] of mapB.entries()) {
          const usageFp = fpB.split("|")[1] || fpB;
          usageOnlyMapB.set(usageFp, entries);
        }
        const usageFp = fp.split("|")[1] || fp;
        entriesB = usageOnlyMapB.get(usageFp) || [];
      }

      if (!entriesB.length) continue;
      if (entriesA.length===1 && entriesB.length===1) {
        matches[cat].push({ deobName: entriesA[0].name, obfName: entriesB[0].name, fingerprint: fp });
      } else {
        matches[cat].push(...disambiguate(fp, entriesA, entriesB, cat));
      }
    }
  }

  return matches;
}



if(process.argv[2] === "m") {

    const inData = fs.readFileSync(inFile, 'utf-8')
    const outData = fs.readFileSync(inObfuscated, 'utf-8')

    let inAst = acorn.parse(inData)
    let obfAst = acorn.parse(outData);

    const deobIndex = buildIndexFromCode(inAst, inAst.body);
    console.log("Indexed deobfuscated code:");
    console.log("  variables:", [...deobIndex.index.variables.values()].reduce((a, b) => a + b.length, 0));
    console.log("  functions:", [...deobIndex.index.functions.values()].reduce((a, b) => a + b.length, 0));
    console.log("  classes:",   [...deobIndex.index.classes.values()].reduce((a, b) => a + b.length, 0));

    const obIndex = buildIndexFromCode(obfAst, obfAst.body[0].expression.callee.body.body[2].expression.expressions[9].callee.body.body);
    console.log("Indexed obfuscated code:");
    console.log("  variables:", [...deobIndex.index.variables.values()].reduce((a, b) => a + b.length, 0));
    console.log("  functions:", [...deobIndex.index.functions.values()].reduce((a, b) => a + b.length, 0));
    console.log("  classes:",   [...deobIndex.index.classes.values()].reduce((a, b) => a + b.length, 0));

    const matches = findMatches(deobIndex, obIndex);

    for (const m of matches.variables) {
        console.log(`var ${m.deobName} ↔ ${m.obfName}`);
    }
    for (const m of matches.functions) {
        console.log(`function ${m.deobName} ↔ ${m.obfName}`);
    }
    for (const m of matches.classes) {
        console.log(`class ${m.deobName} ↔ ${m.obfName}`);
    }
}