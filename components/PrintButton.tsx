"use client";

export default function PrintButton() {
  return (
    <button className="btn btn-secondary" onClick={() => window.print()} type="button">
      ⎙ Print
    </button>
  );
}
