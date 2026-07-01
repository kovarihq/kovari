import React from "react";
import { MessageCircle, Users } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex-1 h-full flex items-center justify-center bg-background">
      <div className="text-center p-8">
        <div className="mb-6">
          <h2 className="text-md font-semibold text-foreground mb-2">
            Welcome to Chat
          </h2>
          <p className="text-muted-foreground text-sm max-w-lg">
            Select a conversation from the inbox to start chatting.
          </p>
        </div>
      </div>
    </div>
  );
}

