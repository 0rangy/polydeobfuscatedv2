const ten = 10;
let ab = 'ab';
let ab_1 = 43;
class Vector3 {
    constructor(a, b, c) {
        Vector3.prototype.isVector3 = true;
        this.x = a;
        this.y = b;
        this.z = c;
    }
    setScalar(a) {
        const b = this;
        return b.x = a, b.y = a, b.z = a, b;
    }
    multiplyByTen(ab = 1) {
        this.x = b(this.x, ten * ab);
        this.y = b(this.y, ten * ab);
        this.z = b(this.z, ten * ab);
        function b(a, ab) {
            return a * ab;
        }
        return this;
    }
}
console.log(ab_1);