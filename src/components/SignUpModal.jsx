import React, { useState } from "react";
import "../styles/SignupModal.css";
import TandC from "./TandC";
import SignupOTP from "./SignupOTP";

const SignUpModal = ({ onClose, onSwitchToLogin }) => {

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [confirm, setConfirm] = useState("");
const [phone, setPhone] = useState("");

const [showTerms, setShowTerms] = useState(false);
const [termsAccepted, setTermsAccepted] = useState(false);

const [showOTP, setShowOTP] = useState(false);
const [generatedOTP, setGeneratedOTP] = useState("");

const phoneRegex = /^(\+639|09)\d{9}$/;

const handleSubmit = (e) => {
e.preventDefault();

if (password !== confirm) {
alert("Passwords do not match");
return;
}

if (phone && !phoneRegex.test(phone)) {
alert("Enter valid PH number");
return;
}

if (!termsAccepted) {
alert("You must agree to Terms & Conditions");
return;
}

const otp = Math.floor(100000 + Math.random() * 900000).toString();

setGeneratedOTP(otp);
setShowOTP(true);

};

const handleVerifyOTP = async () => {

try {

const response = await fetch("http://localhost:5000/api/signup", {
method: "POST",
headers: {
"Content-Type": "application/json"
},
body: JSON.stringify({
email,
password,
phone
})
});

const data = await response.json();

if (!response.ok) {
alert(data.message);
return;
}

alert("Signup successful!");

setShowOTP(false);
onClose();

} catch (error) {

console.error(error);
alert("Server error");

}

const handleSubmit = (e) => {
e.preventDefault();

console.log("Signup button clicked");

if (password !== confirm) {
alert("Passwords do not match");
return;
}

if (phone && !phoneRegex.test(phone)) {
alert("Enter valid PH number");
return;
}

if (!termsAccepted) {
alert("You must agree to Terms & Conditions");
return;
}

const otp = Math.floor(100000 + Math.random() * 900000).toString();

console.log("OTP:", otp);

setGeneratedOTP(otp);
setShowOTP(true);
};

};

return (
<>

<div className="modal-overlay" onClick={onClose}>

<div
className="signup-modal"
onClick={(e) => e.stopPropagation()}
>

<h2 className="modal-title">Sign Up</h2>

<form onSubmit={handleSubmit} className="modal-form">

<label>Email</label>
<input
type="email"
placeholder="Enter your email"
value={email}
onChange={(e) => setEmail(e.target.value)}
required
/>

<label>Password</label>
<input
type="password"
placeholder="Enter your password"
value={password}
onChange={(e) => setPassword(e.target.value)}
required
/>

<label>Confirm Password</label>
<input
type="password"
placeholder="Confirm password"
value={confirm}
onChange={(e) => setConfirm(e.target.value)}
required
/>

<label>Phone</label>
<input
type="tel"
placeholder="Phone number"
value={phone}
onChange={(e) => setPhone(e.target.value)}
/>

<label className="terms">

<input type="checkbox" checked={termsAccepted} readOnly />

I agree to the{" "}
<button
type="button"
className="terms-link"
onClick={() => setShowTerms(true)}
>
Terms & Conditions
</button>

</label>

<button type="submit" className="signup-btn">
Sign Up
</button>

</form>

<p className="login-link">
Already have an account?{" "}
<span onClick={onSwitchToLogin}>Login</span>
</p>

<TandC
isOpen={showTerms}
onAgree={() => {
setTermsAccepted(true);
setShowTerms(false);
}}
onCancel={() => {
setTermsAccepted(false);
setShowTerms(false);
}}
/>

</div>
</div>

<SignupOTP
isOpen={showOTP}
email={email}
otp={generatedOTP}
onVerify={handleVerifyOTP}
onClose={() => setShowOTP(false)}
/>

</>
);

};

export default SignUpModal;