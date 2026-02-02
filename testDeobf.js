const ten = 10;
let ab = "ab";
function clamp( value, min, max ) {
	return Math.max( min, Math.min( max, value ) );
}
class Vector3 {
	constructor( x, y, z ) {
		Vector3.prototype.isVector3 = true;
		this.x = x;
		this.y = y;
		this.z = z;
	}
	setScalar( scalar ) {
		const thisCopy = this;
		thisCopy.x = scalar;
		thisCopy.y = scalar;
		thisCopy.z = scalar;

		return thisCopy;
	}
	multiplyByTen(times = 1) {
		this.x = multiply(this.x, ten * times);
		this.y = multiply(this.y, ten * times);
		this.z = multiply(this.z, ten * times);

		function multiply(first, second) {
			return first * second;
		}    
		return this;
	}
	clamp( min, max ) {
		this.x = clamp( this.x, min.x, max.x );
		this.y = clamp( this.y, min.y, max.y );
		this.z = clamp( this.z, min.z, max.z );

		return this;
	}
}