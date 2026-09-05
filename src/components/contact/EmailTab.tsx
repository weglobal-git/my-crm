"use client";

import { useState } from "react";
import { 
  Mail, 
  Send, 
  Sparkles
} from "lucide-react";
import { useDialog } from "@/providers/DialogProvider";

export function EmailTab({
  customerName,
  customerEmail,
}: {
  customerName: string;
  customerEmail: string | null;
}) {
  const { toast } = useDialog();
  const [isComposing, setIsComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail) {
      return toast({
        title: "No Email",
        description: "This person does not have a registered email address.",
        type: "warning",
      });
    }
    if (!subject.trim() || !message.trim()) {
      return toast({
        title: "Validation",
        description: "Subject and Message are required.",
        type: "warning",
      });
    }

    setIsSending(true);
    // Simulate sending email / queueing draft
    setTimeout(() => {
      setIsSending(false);
      setIsComposing(false);
      setSubject("");
      setMessage("");
      toast({
        title: "Email Queued",
        description: `Message sent to ${customerEmail}.`,
        type: "success",
      });
    }, 600);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#3A3B3C]">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#C7F33C]" />
            Email Communications
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Recipient:{" "}
            <span className="text-slate-200 font-semibold">
              {customerEmail || "No email provided"}
            </span>
          </p>
        </div>

        {customerEmail && (
          <button
            type="button"
            onClick={() => setIsComposing(!isComposing)}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5 text-black" />
            {isComposing ? "Cancel Compose" : "Compose Email"}
          </button>
        )}
      </div>

      {/* Integration Roadmap Notice */}
      <div className="bg-[#1C1C1D] rounded-xl p-3.5 flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-[#C7F33C] shrink-0 mt-0.5" />
        <div className="flex flex-col text-xs">
          <span className="font-bold text-slate-200">
            Google Workspace Integration Roadmap
          </span>
          <span className="text-slate-400 mt-0.5">
            This module is structured for two-way synchronization with the account
            Gmail. Direct inbox sync and outbound replies will activate
            once the Google Workspace Mail permission scope is enabled.
          </span>
        </div>
      </div>

      {/* Compose Form */}
      {isComposing && (
        <form
          onSubmit={handleSend}
          className="bg-[#3A3B3C] rounded-2xl p-5 flex flex-col gap-4 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              New Message to {customerName}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Quotation Update & Shipping Schedule"
              className="bg-[#252728] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors border-0"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Message</label>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your email here..."
              className="bg-[#252728] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C7F33C] transition-colors resize-none border-0"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsComposing(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
            >
              Discard
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#C7F33C] text-black hover:bg-[#b5dc35] transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {isSending ? "Sending..." : "Send Message"}
            </button>
          </div>
        </form>
      )}

      {/* Mock Email Threads List */}
      <div className="flex flex-col gap-3">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Message History
        </div>

        {!customerEmail ? (
          <div className="p-8 text-center text-slate-500 bg-[#3A3B3C]/40 border border-[#4E4F50] rounded-2xl">
            Add an email address to this contact to enable email history and replies.
          </div>
        ) : (
          <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-[#4E4F50]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-200">{customerName}</span>
                <span className="text-slate-500">&lt;{customerEmail}&gt;</span>
              </div>
              <span className="text-slate-400">Previous Thread</span>
            </div>
            <div className="text-xs text-slate-300">
              <span className="font-semibold block text-slate-200 mb-1">
                Re: Export Inquiry & Product Catalog Request
              </span>
              <p className="text-slate-400 leading-relaxed">
                Thank you for the prompt response. We have received the latest
                specifications and will review the FOB pricing with our procurement
                board.
              </p>
            </div>
            <div className="flex justify-end text-[10px] text-slate-500 pt-1">
              Synchronized via CRM system
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
