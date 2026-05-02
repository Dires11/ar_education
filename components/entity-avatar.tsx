"use client";

import { ShieldUserIcon, UserRoundIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type AvatarProps = {
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "default" | "lg";
  className?: string;
};

function initials(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName]
    .filter(Boolean)
    .map((value) => value!.slice(0, 1).toUpperCase())
    .join("")
    .slice(0, 2);
}

export function StudentAvatar({
  firstName,
  lastName,
  avatarUrl,
  size = "default",
  className,
}: AvatarProps) {
  return (
    <Avatar size={size} className={cn("bg-sky-100 text-sky-900", className)}>
      {avatarUrl && (
        <AvatarImage
          src={avatarUrl}
          alt={`${firstName ?? ""} ${lastName ?? ""}`.trim()}
        />
      )}
      <AvatarFallback className="bg-sky-100 text-sky-900">
        {initials(firstName, lastName) || <UserRoundIcon className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  );
}

export function GuardianAvatar({
  firstName,
  lastName,
  avatarUrl,
  size = "default",
  className,
}: AvatarProps) {
  return (
    <Avatar size={size} className={cn("bg-amber-100 text-amber-900", className)}>
      {avatarUrl && (
        <AvatarImage
          src={avatarUrl}
          alt={`${firstName ?? ""} ${lastName ?? ""}`.trim()}
        />
      )}
      <AvatarFallback className="bg-amber-100 text-amber-900">
        {initials(firstName, lastName) || (
          <ShieldUserIcon className="h-4 w-4" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}

export function TutorAvatar({
  firstName,
  lastName,
  avatarUrl,
  size = "default",
  className,
}: AvatarProps) {
  return (
    <Avatar size={size} className={cn("bg-violet-100 text-violet-900", className)}>
      {avatarUrl && (
        <AvatarImage
          src={avatarUrl}
          alt={`${firstName ?? ""} ${lastName ?? ""}`.trim()}
        />
      )}
      <AvatarFallback className="bg-violet-100 text-violet-900">
        {initials(firstName, lastName) || <UserRoundIcon className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  );
}
