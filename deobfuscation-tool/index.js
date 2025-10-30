const fs = require("fs");
const acorn = require("acorn");
const walk = require("acorn-walk");
const crypto = require("crypto");
const estraverse = require("estraverse");
const escodegen = require("escodegen");

let verbose = false;
let inFile = null;
let inObfuscated = null;
let outFile = "out.js";

for (let i = 3; i < process.argv.length; i++) {
    if (process.argv[i].startsWith("-v")) {
        verbose = true;
        continue;
    }
    // Merge subcommand arguments
    if (process.argv[2] === "m") {
        if (process.argv[i].startsWith("-o")) {
            obfFile = process.argv[i + 1];
        } else {
            typeof inFile !== "string"
                ? (inFile = process.argv[i])
                : (inObfuscated = process.argv[i]);
        }
    }
}
console.log({ verbose, inFile, inObfuscated, outFile });

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
        if (["start", "end", "loc", "raw"].includes(k)) continue;
        const v = node[k];

        if (node.type === "Identifier" && k === "name") {
            out[k] = "_";
            continue;
        }

        out[k] = normalizeNode(v);
    }
    // if(escodegen.generate(node) === "this.x") console.log(JSON.stringify(node, null, 2));
    // console.log(escodegen.generate(node));
    // console.log(escodegen.generate(out));

    return out;
}

function fingerprintNode(node) {
    //   console.log(node)
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
                    if (
                        !parent.computed &&
                        parent.property &&
                        parent.property.type === "Identifier"
                    ) {
                        props.add(parent.property.name);
                    }
                } else if (parent.property === node) {
                    usageTypes.add("property");
                }
            } else {
                usageTypes.add(parent.type);
            }

            counts[kind] = (counts[kind] || 0) + 1;
        },
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

    function addToMap(map, fp, entry) {
        if (!map.has(fp)) map.set(fp, []);
        map.get(fp).push(entry);
    }

    function buildUsageSignatureFor(name) {
        const usage = buildVariableUsageSignature(ast, name);
        return hashString(JSON.stringify(usage));
    }

    function combineFingerprint(contentFp, usageFp) {
        return contentFp + "|" + usageFp;
    }

    for (const node of top) {
        // --- VARIABLES ---
        if (node.type === "VariableDeclaration") {
            for (const decl of node.declarations) {
                if (!decl.id || decl.id.type !== "Identifier") continue;
                const name = decl.id.name;
                const usageFp = buildUsageSignatureFor(name);

                let contentFp = "";
                if (decl.init) {
                    if (
                        ["ArrowFunctionExpression", "FunctionExpression"].includes(
                            decl.init.type
                        )
                    ) {
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
                addToMap(index.variables, combinedFp, { name, node });
            }
        }
        if (!node.id) continue;
        // ---- FUNCTIONS ----
        if (node.type === "FunctionDeclaration") {
            const name = node.id.name;
            const usageFp = buildUsageSignatureFor(name);
            const contentFp = fingerprintNode(node.body);
            const combinedFp = combineFingerprint(contentFp, usageFp);
            addToMap(index.functions, combinedFp, { name, node });
        }
        // --- CLASSES ---
        if (node.type === "ClassDeclaration") {
            const name = node.id.name;
            const usageFp = buildUsageSignatureFor(name);

            const methodMap = [];
            const methodNames = [];
            for (const el of node.body.body || []) {
                if (el.type === "MethodDefinition") {
                    methodMap.push(fingerprintNode(el.value.body || el.value));
                    methodNames.push(el.key.name);
                }
            }
            methodMap.sort();
            methodNames.sort();
            const contentFp = hashString(JSON.stringify(methodMap));
            const methodFp =
                methodNames.length > 1 ? hashString(JSON.stringify(methodNames)) : null;

            const combinedFp = combineFingerprint(contentFp, usageFp);

            name === "Vector3" || name === "bn"
                ? console.log({ name, contentFp, usageFp, methodFp })
                : null;
            addToMap(
                index.classes,
                methodFp ? combineFingerprint(combinedFp, methodFp) : combinedFp,
                { name, node }
            );
        }
    }

    return { index };
}

/**
 * - indexA: deob index (Map fingerprints -> [{ name, node, ... }])
 * - indexB: obf index (same shape)
 */
function findMatches(indexAObj, indexBObj) {
    const { index: indexA } = indexAObj;
    const { index: indexB } = indexBObj;

    const matches = { variables: [], functions: [], classes: [], unmatched: [] };
    const getEntries = (map, fp) => (map.has(fp) ? map.get(fp).slice() : []);
    const entryPos = (entry) => entry?.node?.start ?? 0;

    function disambiguate(fp, entriesA, entriesB) {
        entriesA.sort((a, b) => entryPos(a) - entryPos(b));
        entriesB.sort((a, b) => entryPos(a) - entryPos(b));
        const n = Math.min(entriesA.length, entriesB.length);
        return Array.from({ length: n }, (_, i) => ({
            deobName: entriesA[i].name,
            obfName: entriesB[i].name,
            fingerprint: fp,
        }));
    }

    for (const cat of ["variables", "functions", "classes"]) {
        const mapA = indexA[cat],
            mapB = indexB[cat];
        if (!mapA || !mapB) {
            verbose &&
                console.log(
                    `No entries for category ${cat} in one of the indexes, skipping...`
                );
            continue;
        }

        for (const [fp, entriesA] of mapA.entries()) {
            let entriesB = getEntries(mapB, fp);
            console.log(JSON.stringify(fp));
            // fallback: content only
            if (!entriesB.length) {
                verbose &&
                    console.log(
                        `No direct match for ${cat} fingerprint ${fp} (${entriesA[0].name}), trying content-only fallback...`
                    );
                const contentOnlyMapB = new Map();
                for (const [fpB, entries] of mapB.entries()) {
                    const content = fpB.split("|")[0] || fpB;
                    contentOnlyMapB.set(content, entries);
                }
                const contentFp = fp.split("|")[0] || fp;
                entriesB = contentOnlyMapB.get(contentFp) || [];
                verbose &&
                    entriesB.length > 0 &&
                    console.log(
                        `Found ${entriesB.length} entries for content-only fallback for ${cat} fingerprint ${fp} (${entriesA[0].name})`
                    );
            }

            if (!entriesB.length && fp.split("|")[2]) {
                // fallback: method-names-only (classes only)
                verbose &&
                    console.log(
                        `No match for ${cat} fingerprint ${fp} (${entriesA[0].name}), testing method-name-only fallback...`
                    );
                const mNameOnlyMapB = new Map();
                for (const [fpB, entries] of mapB.entries()) {
                    const methodFp = fpB.split("|")[2] || null;
                    methodFp && mNameOnlyMapB.set(methodFp, entries);
                }
                const contentFp = fp.split("|")[2];
                entriesB = mNameOnlyMapB.get(contentFp) || [];
                verbose &&
                    entriesB.length > 0 &&
                    console.log(
                        `Found ${entriesB.length} entries for method-names-only fallback for ${cat} fingerprint ${fp} (${entriesA[0].name})`
                    );
            }
            if (!entriesB.length) {
                verbose &&
                    console.log(
                        `No match for ${cat} fingerprint ${fp} (${entriesA[0].name})`
                    );
                matches.unmatched.push({
                    category: cat,
                    deobName: entriesA[0].name,
                    fingerprint: fp,
                });
                continue;
            }
            if (entriesA.length === 1 && entriesB.length === 1) {
                verbose &&
                    console.log(
                        `Direct match for ${cat}: ${entriesA[0].name} ↔ ${entriesB[0].name}`
                    );
                matches[cat].push({
                    deobName: entriesA[0].name,
                    obfName: entriesB[0].name,
                });
            } else {
                verbose &&
                    console.log(
                        `Ambiguous match for ${cat} (count A: ${entriesA.length}, count B: ${entriesB.length}), disambiguating...`
                    );
                entriesA.length !== entriesB.length &&
                    console.log(
                        `Warning: unequal counts during disambiguation for ${cat} fingerprint ${fp} (${entriesA[0].name}): ${entriesA.length} vs ${entriesB.length}`
                    );
                matches[cat].push(...disambiguate(fp, entriesA, entriesB));
            }
        }
    }

    return matches;
}

function applyRenames(ast, _renameMap) {
    const usedNames = new Set();
    const renameMap = _renameMap;

    estraverse.traverse(ast, {
        enter(node, parent) {
            // Only top level
            if(parent === ast) {
                return;
            }
            // Skip static property names: obj.prop
            if (
                parent &&
                parent.type === "MemberExpression" &&
                parent.property === node &&
                !parent.computed
            ) {
                return;
            }

            // Skip object literal keys: { key: value }
            if (
                parent &&
                parent.type === "Property" &&
                parent.key === node &&
                !parent.computed
            ) {
                return;
            }

            // Skip method keys in classes
            if (parent && parent.type === "MethodDefinition" && parent.key === node) {
                // Skip the constructor or any uncomputed method names
                if (parent.kind === "constructor" || !parent.computed) {
                    return;
                }
            }

            if (node.type === "Identifier" && renameMap[node.name]) {
                let newName = renameMap[node.name];
                usedNames.add(newName);
                node.name = newName;
            } else if (node.type === "Identifier" && usedNames.has(node.name)) {
                let i = 1;
                let newName = node.name;
                while (usedNames.has(`${newName}_${i}`)) i++;
                newName = `${newName}_${i}`;
                renameMap[node.name] = newName;
                usedNames.add(newName);
                node.name = newName;
            }
        },
    });
}

if (process.argv[2] === "m") {
    const inData = fs.readFileSync(inFile, "utf-8");
    const outData = fs.readFileSync(inObfuscated, "utf-8");

    let inAst = acorn.parse(inData);
    let obfAst = acorn.parse(outData);

    const deobIndex = buildIndexFromCode(inAst, inAst.body);
    console.log("Indexed deobfuscated code:");
    console.log(
        "  variables:",
        [...deobIndex.index.variables.values()].reduce((a, b) => a + b.length, 0)
    );
    console.log(
        "  functions:",
        [...deobIndex.index.functions.values()].reduce((a, b) => a + b.length, 0)
    );
    console.log(
        "  classes:",
        [...deobIndex.index.classes.values()].reduce((a, b) => a + b.length, 0)
    );

    const obIndex = buildIndexFromCode(
        obfAst,
        obfAst.body[0].expression.callee.body.body[2].expression.expressions[15]
            .callee.body.body
    );
    console.log("Indexed obfuscated code:");
    console.log(
        "  variables:",
        [...deobIndex.index.variables.values()].reduce((a, b) => a + b.length, 0)
    );
    console.log(
        "  functions:",
        [...deobIndex.index.functions.values()].reduce((a, b) => a + b.length, 0)
    );
    console.log(
        "  classes:",
        [...deobIndex.index.classes.values()].reduce((a, b) => a + b.length, 0)
    );

    const matches = findMatches(deobIndex, obIndex);

    for (let unmatched of matches.unmatched) {
        console.log(`Unmatched ${unmatched.category}: ${unmatched.deobName}`);
    }

    renameMap = {};
    for (let cat of ["variables", "functions", "classes"]) {
        for (let match of matches[cat]) {
            renameMap[match.obfName] = match.deobName;
        }
    }
    applyRenames(
        obfAst.body[0].expression.callee.body.body[2].expression.expressions[15]
            .callee.body,
        renameMap
    );

    fs.writeFileSync(outFile, escodegen.generate(obfAst));
} else if (process.argv[2] === "t") {
    let inAst = acorn.parse(`
        let ten = 10;
        let ab = "ab";

        class Vector3 {
            constructor( x, y, z ) {
                Vector3.prototype.isVector3 = true;
                this.x = x;
                this.y = y;
                this.z = z;
            }
            setScalar( scalar ) {
                this.x = scalar;
                this.y = scalar;
                this.z = scalar;

                return this;
            }
            multiplyByTen() {
                this.x *= ten;
                this.y *= ten;
                this.z *= ten;
                return this;
            }
        }
        `);
    let obfAst = acorn.parse(`
        let a = 10;
        let b = "ab";
        let ab = 43;
        class bn {       
            constructor( e, t, n ) { 
                bn.prototype.isVector3 = true;
                this.x = e;
                this.y = t;
                this.z = n;
            }
            setScalar(e) {
                return (this.x = e), (this.y = e), (this.z = e), this;
            }
            multiplyByTen() {
                this.x *= a;
                this.y *= a;
                this.z *= a;
                return this;
            }
        }
        console.log(ab);
        `);

    const deobIndex = buildIndexFromCode(inAst, inAst.body);
    const obIndex = buildIndexFromCode(obfAst, obfAst.body);

    const matches = findMatches(deobIndex, obIndex);
    console.log(JSON.stringify(matches, null, 2));
    renameMap = {};
    for (let cat of ["variables", "functions", "classes"]) {
        for (let match of matches[cat]) {
            renameMap[match.obfName] = match.deobName;
        }
    }
    applyRenames(obfAst, renameMap);
    fs.writeFileSync(`${outFile}ast`, JSON.stringify(obfAst));
    fs.writeFileSync(
        outFile,
        escodegen
            .generate(obfAst)
    );
}
