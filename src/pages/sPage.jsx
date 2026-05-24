import React from "react";
import SHeader from "../components/sHeader";
import SBody from "../components/sBody";
import SFooter from "../components/sFooter";

const HomePage = () => {
  return (
    <>
      <SHeader />

      {/* Main content */}
      <SBody>
        <h1>Welcome to the Home Page</h1>
        <p>This is where you can explore our features and offerings.</p>
      </SBody>

      <SFooter />
    </>
  );
};

export default HomePage;
