import React from "react";
import "../styles/TandC.css";

const TandC = ({ isOpen, onAgree, onCancel }) => {

if (!isOpen) return null;

return ( <div className="modal-overlay">

  <div className="tandc-modal">

    <h2>Terms & Conditions</h2>

    <div className="tandc-content">

      <p>
        By creating an account, you agree to comply with all the rules
        and policies of this application.
      </p>

      <p>
        You are responsible for keeping your account credentials secure.
        Any activity that occurs under your account is your responsibility.
      </p>

      <p>
        We respect your privacy and your personal information will be
        handled according to our privacy policy.
      </p>

      <p>
        The platform may update these terms at any time. Continued use
        of the service means that you accept the updated terms.
      </p>

    </div>

    <div className="tandc-actions">

      <button
        className="agree-btn"
        onClick={onAgree}
      >
        Agree
      </button>

      <button
        className="cancel-btn"
        onClick={onCancel}
      >
        Cancel
      </button>

    </div>

  </div>

</div>


);
};

export default TandC;
