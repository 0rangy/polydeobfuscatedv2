class yn {
                constructor(e = 0, t = 0, n = 0) {
                    (yn.prototype.isVector3 = !0),
                        (this.x = e),
                        (this.y = t),
                        (this.z = n);
                }
                set(e, t, n) {
                    return (
                        void 0 === n && (n = this.z),
                        (this.x = e),
                        (this.y = t),
                        (this.z = n),
                        this
                    );
                }
                setScalar(e) {
                    return (this.x = e), (this.y = e), (this.z = e), this;
                }
                setX(e) {
                    return (this.x = e), this;
                }
                setY(e) {
                    return (this.y = e), this;
                }
                setZ(e) {
                    return (this.z = e), this;
                }
                setComponent(e, t) {
                    switch (e) {
                        case 0:
                            this.x = t;
                            break;
                        case 1:
                            this.y = t;
                            break;
                        case 2:
                            this.z = t;
                            break;
                        default:
                            throw new Error("index is out of range: " + e);
                    }
                    return this;
                }
                getComponent(e) {
                    switch (e) {
                        case 0:
                            return this.x;
                        case 1:
                            return this.y;
                        case 2:
                            return this.z;
                        default:
                            throw new Error("index is out of range: " + e);
                    }
                }
                clone() {
                    return new this.constructor(this.x, this.y, this.z);
                }
                copy(e) {
                    return (this.x = e.x), (this.y = e.y), (this.z = e.z), this;
                }
                add(e) {
                    return (
                        (this.x += e.x), (this.y += e.y), (this.z += e.z), this
                    );
                }
                addScalar(e) {
                    return (this.x += e), (this.y += e), (this.z += e), this;
                }
                addVectors(e, t) {
                    return (
                        (this.x = e.x + t.x),
                        (this.y = e.y + t.y),
                        (this.z = e.z + t.z),
                        this
                    );
                }
                addScaledVector(e, t) {
                    return (
                        (this.x += e.x * t),
                        (this.y += e.y * t),
                        (this.z += e.z * t),
                        this
                    );
                }
                sub(e) {
                    return (
                        (this.x -= e.x), (this.y -= e.y), (this.z -= e.z), this
                    );
                }
                subScalar(e) {
                    return (this.x -= e), (this.y -= e), (this.z -= e), this;
                }
                subVectors(e, t) {
                    return (
                        (this.x = e.x - t.x),
                        (this.y = e.y - t.y),
                        (this.z = e.z - t.z),
                        this
                    );
                }
                multiply(e) {
                    return (
                        (this.x *= e.x), (this.y *= e.y), (this.z *= e.z), this
                    );
                }
                multiplyScalar(e) {
                    return (this.x *= e), (this.y *= e), (this.z *= e), this;
                }
                multiplyVectors(e, t) {
                    return (
                        (this.x = e.x * t.x),
                        (this.y = e.y * t.y),
                        (this.z = e.z * t.z),
                        this
                    );
                }
                applyEuler(e) {
                    return this.applyQuaternion(bn.setFromEuler(e));
                }
                applyAxisAngle(e, t) {
                    return this.applyQuaternion(bn.setFromAxisAngle(e, t));
                }
                applyMatrix3(e) {
                    const t = this.x,
                        n = this.y,
                        i = this.z,
                        r = e.elements;
                    return (
                        (this.x = r[0] * t + r[3] * n + r[6] * i),
                        (this.y = r[1] * t + r[4] * n + r[7] * i),
                        (this.z = r[2] * t + r[5] * n + r[8] * i),
                        this
                    );
                }
                applyNormalMatrix(e) {
                    return this.applyMatrix3(e).normalize();
                }
                applyMatrix4(e) {
                    const t = this.x,
                        n = this.y,
                        i = this.z,
                        r = e.elements,
                        a = 1 / (r[3] * t + r[7] * n + r[11] * i + r[15]);
                    return (
                        (this.x = (r[0] * t + r[4] * n + r[8] * i + r[12]) * a),
                        (this.y = (r[1] * t + r[5] * n + r[9] * i + r[13]) * a),
                        (this.z =
                            (r[2] * t + r[6] * n + r[10] * i + r[14]) * a),
                        this
                    );
                }
                applyQuaternion(e) {
                    const t = this.x,
                        n = this.y,
                        i = this.z,
                        r = e.x,
                        a = e.y,
                        s = e.z,
                        o = e.w,
                        l = 2 * (a * i - s * n),
                        c = 2 * (s * t - r * i),
                        h = 2 * (r * n - a * t);
                    return (
                        (this.x = t + o * l + a * h - s * c),
                        (this.y = n + o * c + s * l - r * h),
                        (this.z = i + o * h + r * c - a * l),
                        this
                    );
                }
                project(e) {
                    return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(
                        e.projectionMatrix
                    );
                }
                unproject(e) {
                    return this.applyMatrix4(
                        e.projectionMatrixInverse
                    ).applyMatrix4(e.matrixWorld);
                }
                transformDirection(e) {
                    const t = this.x,
                        n = this.y,
                        i = this.z,
                        r = e.elements;
                    return (
                        (this.x = r[0] * t + r[4] * n + r[8] * i),
                        (this.y = r[1] * t + r[5] * n + r[9] * i),
                        (this.z = r[2] * t + r[6] * n + r[10] * i),
                        this.normalize()
                    );
                }
                divide(e) {
                    return (
                        (this.x /= e.x), (this.y /= e.y), (this.z /= e.z), this
                    );
                }
                divideScalar(e) {
                    return this.multiplyScalar(1 / e);
                }
                min(e) {
                    return (
                        (this.x = Math.min(this.x, e.x)),
                        (this.y = Math.min(this.y, e.y)),
                        (this.z = Math.min(this.z, e.z)),
                        this
                    );
                }
                max(e) {
                    return (
                        (this.x = Math.max(this.x, e.x)),
                        (this.y = Math.max(this.y, e.y)),
                        (this.z = Math.max(this.z, e.z)),
                        this
                    );
                }
                clamp(e, t) {
                    return (
                        (this.x = Ot(this.x, e.x, t.x)),
                        (this.y = Ot(this.y, e.y, t.y)),
                        (this.z = Ot(this.z, e.z, t.z)),
                        this
                    );
                }
                clampScalar(e, t) {
                    return (
                        (this.x = Ot(this.x, e, t)),
                        (this.y = Ot(this.y, e, t)),
                        (this.z = Ot(this.z, e, t)),
                        this
                    );
                }
                clampLength(e, t) {
                    const n = this.length();
                    return this.divideScalar(n || 1).multiplyScalar(
                        Ot(n, e, t)
                    );
                }
                floor() {
                    return (
                        (this.x = Math.floor(this.x)),
                        (this.y = Math.floor(this.y)),
                        (this.z = Math.floor(this.z)),
                        this
                    );
                }
                ceil() {
                    return (
                        (this.x = Math.ceil(this.x)),
                        (this.y = Math.ceil(this.y)),
                        (this.z = Math.ceil(this.z)),
                        this
                    );
                }
                round() {
                    return (
                        (this.x = Math.round(this.x)),
                        (this.y = Math.round(this.y)),
                        (this.z = Math.round(this.z)),
                        this
                    );
                }
                roundToZero() {
                    return (
                        (this.x = Math.trunc(this.x)),
                        (this.y = Math.trunc(this.y)),
                        (this.z = Math.trunc(this.z)),
                        this
                    );
                }
                negate() {
                    return (
                        (this.x = -this.x),
                        (this.y = -this.y),
                        (this.z = -this.z),
                        this
                    );
                }
                dot(e) {
                    return this.x * e.x + this.y * e.y + this.z * e.z;
                }
                lengthSq() {
                    return this.x * this.x + this.y * this.y + this.z * this.z;
                }
                length() {
                    return Math.sqrt(
                        this.x * this.x + this.y * this.y + this.z * this.z
                    );
                }
                manhattanLength() {
                    return (
                        Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z)
                    );
                }
                normalize() {
                    return this.divideScalar(this.length() || 1);
                }
                setLength(e) {
                    return this.normalize().multiplyScalar(e);
                }
                lerp(e, t) {
                    return (
                        (this.x += (e.x - this.x) * t),
                        (this.y += (e.y - this.y) * t),
                        (this.z += (e.z - this.z) * t),
                        this
                    );
                }
                lerpVectors(e, t, n) {
                    return (
                        (this.x = e.x + (t.x - e.x) * n),
                        (this.y = e.y + (t.y - e.y) * n),
                        (this.z = e.z + (t.z - e.z) * n),
                        this
                    );
                }
                cross(e) {
                    return this.crossVectors(this, e);
                }
                crossVectors(e, t) {
                    const n = e.x,
                        i = e.y,
                        r = e.z,
                        a = t.x,
                        s = t.y,
                        o = t.z;
                    return (
                        (this.x = i * o - r * s),
                        (this.y = r * a - n * o),
                        (this.z = n * s - i * a),
                        this
                    );
                }
                projectOnVector(e) {
                    const t = e.lengthSq();
                    if (0 === t) return this.set(0, 0, 0);
                    const n = e.dot(this) / t;
                    return this.copy(e).multiplyScalar(n);
                }
                projectOnPlane(e) {
                    return An.copy(this).projectOnVector(e), this.sub(An);
                }
                reflect(e) {
                    return this.sub(An.copy(e).multiplyScalar(2 * this.dot(e)));
                }
                angleTo(e) {
                    const t = Math.sqrt(this.lengthSq() * e.lengthSq());
                    if (0 === t) return Math.PI / 2;
                    const n = this.dot(e) / t;
                    return Math.acos(Ot(n, -1, 1));
                }
                distanceTo(e) {
                    return Math.sqrt(this.distanceToSquared(e));
                }
                distanceToSquared(e) {
                    const t = this.x - e.x,
                        n = this.y - e.y,
                        i = this.z - e.z;
                    return t * t + n * n + i * i;
                }
                manhattanDistanceTo(e) {
                    return (
                        Math.abs(this.x - e.x) +
                        Math.abs(this.y - e.y) +
                        Math.abs(this.z - e.z)
                    );
                }
                setFromSpherical(e) {
                    return this.setFromSphericalCoords(
                        e.radius,
                        e.phi,
                        e.theta
                    );
                }
                setFromSphericalCoords(e, t, n) {
                    const i = Math.sin(t) * e;
                    return (
                        (this.x = i * Math.sin(n)),
                        (this.y = Math.cos(t) * e),
                        (this.z = i * Math.cos(n)),
                        this
                    );
                }
                setFromCylindrical(e) {
                    return this.setFromCylindricalCoords(
                        e.radius,
                        e.theta,
                        e.y
                    );
                }
                setFromCylindricalCoords(e, t, n) {
                    return (
                        (this.x = e * Math.sin(t)),
                        (this.y = n),
                        (this.z = e * Math.cos(t)),
                        this
                    );
                }
                setFromMatrixPosition(e) {
                    const t = e.elements;
                    return (
                        (this.x = t[12]),
                        (this.y = t[13]),
                        (this.z = t[14]),
                        this
                    );
                }
                setFromMatrixScale(e) {
                    const t = this.setFromMatrixColumn(e, 0).length(),
                        n = this.setFromMatrixColumn(e, 1).length(),
                        i = this.setFromMatrixColumn(e, 2).length();
                    return (this.x = t), (this.y = n), (this.z = i), this;
                }
                setFromMatrixColumn(e, t) {
                    return this.fromArray(e.elements, 4 * t);
                }
                setFromMatrix3Column(e, t) {
                    return this.fromArray(e.elements, 3 * t);
                }
                setFromEuler(e) {
                    return (
                        (this.x = e._x), (this.y = e._y), (this.z = e._z), this
                    );
                }
                setFromColor(e) {
                    return (this.x = e.r), (this.y = e.g), (this.z = e.b), this;
                }
                equals(e) {
                    return e.x === this.x && e.y === this.y && e.z === this.z;
                }
                fromArray(e, t = 0) {
                    return (
                        (this.x = e[t]),
                        (this.y = e[t + 1]),
                        (this.z = e[t + 2]),
                        this
                    );
                }
                toArray(e = [], t = 0) {
                    return (
                        (e[t] = this.x),
                        (e[t + 1] = this.y),
                        (e[t + 2] = this.z),
                        e
                    );
                }
                fromBufferAttribute(e, t) {
                    return (
                        (this.x = e.getX(t)),
                        (this.y = e.getY(t)),
                        (this.z = e.getZ(t)),
                        this
                    );
                }
                random() {
                    return (
                        (this.x = Math.random()),
                        (this.y = Math.random()),
                        (this.z = Math.random()),
                        this
                    );
                }
                randomDirection() {
                    const e = Math.random() * Math.PI * 2,
                        t = 2 * Math.random() - 1,
                        n = Math.sqrt(1 - t * t);
                    return (
                        (this.x = n * Math.cos(e)),
                        (this.y = t),
                        (this.z = n * Math.sin(e)),
                        this
                    );
                }
                *[Symbol.iterator]() {
                    yield this.x, yield this.y, yield this.z;
                }
            }