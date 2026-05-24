import React, { useState, useEffect, useRef } from "react";
import "../styles/SignupOTP.css";

const SignupOTP = ({ email, generatedOTP, onClose }) => {

const [otp, setOtp] = useState(["", "", "", "", "", ""]);
const [timer, setTimer] = useState(60);

const inputs = useRef([]);

// TIMER
useEffect(() => {

if (timer === 0) return;

const interval = setInterval(() => {
  setTimer((prev) => prev - 1);
}, 1000);

return () => clearInterval(interval);


}, [timer]);

// INPUT CHANGE
const handleChange = (value, index) => {


if (!/^[0-9]?$/.test(value)) return;

const newOtp = [...otp];
newOtp[index] = value;
setOtp(newOtp);

if (value && index < 5) {
  inputs.current[index + 1].focus();
}


};

// BACKSPACE
const handleKeyDown = (e, index) => {


if (e.key === "Backspace" && !otp[index] && index > 0) {
  inputs.current[index - 1].focus();
}


};

// VERIFY OTP
const verifyOTP = () => {


const enteredOTP = otp.join("");

if (enteredOTP === generatedOTP) {
  alert("Signup successful!");
  onClose();
} else {
  alert("Invalid OTP");
}


};

// RESEND
const resendOTP = () => {
setTimer(60);
alert("OTP resent to " + email);
};

return (


<div className="otp-overlay">

  <div className="otp-modal">

    <h2>Email Verification</h2>

    <p>Enter the OTP sent to</p>
    <b>{email}</b>

    <div className="otp-boxes">

      {otp.map((digit, index) => (

        <input
          key={index}
          type="text"
          maxLength="1"
          value={digit}
          ref={(el) => (inputs.current[index] = el)}
          onChange={(e) => handleChange(e.target.value, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
        />

      ))}

    </div>

    <button className="verify-btn" onClick={verifyOTP}>
      Verify OTP
    </button>

    <div className="resend">

      {timer > 0 ? (
        <p>Resend OTP in {timer}s</p>
      ) : (
        <button onClick={resendOTP}>
          Resend OTP
        </button>
      )}

    </div>

  </div>

</div>


);

};

export default SignupOTP;
