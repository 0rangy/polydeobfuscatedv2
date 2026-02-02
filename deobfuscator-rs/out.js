const a = 10;
let b = "ten";
let ten = 43;
function clamp( a, b, c ) {
    return Math.max( b, Math.min( c, a ) );
}
class Vector3 {       
    constructor( a, b, c ) { 
        Vector3.prototype.isVector3 = true;
        this.x = a;
        this.y = b;
        this.z = c;
    }
    setScalar(a) {
        const b = this;
        return (b.x = a), (b.y = a), (b.z = a), b;
    }
    multiplyByTen(ten = 1) {
        this.x = b(this.x, a*ten);
        this.y = b(this.y, a*ten);
        this.z = b(this.z, a*ten);
        
        function b(a, ten) {
            return a * ten;
        }    
        return this;
    }
    clamp(a, b) {
        this.x = clamp( this.x, a.x, b.x );
        this.y = clamp( this.y, a.y, b.y );
        this.z = clamp( this.z, a.z, b.z );

        return this;
    }
}
console.log(ten);