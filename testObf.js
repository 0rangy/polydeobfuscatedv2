const a = 10;
let b = "ab";
let ab = 43;
function fT( a, b, c ) {
    return Math.max( b, Math.min( c, a ) );
}
class bn {       
    constructor( a, b, c ) { 
        bn.prototype.isVector3 = true;
        this.x = a;
        this.y = b;
        this.z = c;
    }
    setScalar(a) {
        const b = this;
        return (b.x = a), (b.y = a), (b.z = a), b;
    }
    multiplyByTen(ab = 1) {
        this.x = b(this.x, a*ab);
        this.y = b(this.y, a*ab);
        this.z = b(this.z, a*ab);
        
        function b(a, ab) {
            return a * ab;
        }    
        return this;
    }
    clamp(a, b) {
        this.x = fT( this.x, a.x, b.x );
        this.y = fT( this.y, a.y, b.y );
        this.z = fT( this.z, a.z, b.z );

        return this;
    }
}
console.log(ab);