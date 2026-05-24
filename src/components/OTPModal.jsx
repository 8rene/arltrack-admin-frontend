
import React, { useState, useRef } from "react";
import "../styles/otpModal.css";

const OTPModal = ({ email, onVerifySuccess, onClose }) => {

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");

  const inputRefs = useRef([]);

  const handleChange = (value, index) => {

    if (!/^[0-9]?$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1].focus();
    }

  };

  const handleKeyDown = (e, index) => {

    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }

  };

  const handleVerify = async () => {

    const code = otp.join("");

    if (code.length !== 6) {
      setError("Enter the 6 digit OTP");
      return;
    }

    try {

      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          otp: code
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError("Invalid OTP code");
        return;
      }

      setError("");

      // login success
      onVerifySuccess(data);

    } catch (err) {

      console.error(err);
      setError("Server error");

    }

  };

  const handleResend = async () => {

    try {

      await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      alert("OTP sent again");

    } catch (err) {

      console.error(err);

    }

  };

  return (
    <div className="otp-overlay" onClick={onClose}>
      <div className="otp-modal" onClick={(e) => e.stopPropagation()}>

        <h2>OTP Verification</h2>
        <p>Enter the 6 digit code sent to your phone</p>

        <div className="otp-inputs">

          {otp.map((digit, index) => (
            <input
              key={index}
              type="text"
              maxLength="1"
              value={digit}
              ref={(el) => (inputRefs.current[index] = el)}
              onChange={(e) => handleChange(e.target.value, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
            />
          ))}

        </div>

        {error && <p className="otp-error">{error}</p>}

        <button className="verify-btn" onClick={handleVerify}>
          Verify OTP
        </button>

        <button className="resend-btn" onClick={handleResend}>
          Resend OTP
        </button>

      </div>
    </div>
  );
};

export default OTPModal;
