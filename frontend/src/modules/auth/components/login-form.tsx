"use client";

import React, { useState } from "react";
import { ArrowRight, Loader2, Eye, EyeOff, AlertCircle, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";
import { type Session, useLogin } from "../queries/use-session";

export interface LoginFormProps {
  /** Keep cached data when the same user signs back in (session expired mid-edit). */
  keepCacheForUserId?: string;
  defaultEmail?: string;
  onSuccess?: (session: Session) => void;
  className?: string;
}

export function LoginForm({
  keepCacheForUserId,
  defaultEmail = "",
  onSuccess,
  className,
}: LoginFormProps) {
  const login = useLogin(keepCacheForUserId);
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || login.isPending) return;
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (session) => {
          onSuccess?.(session);
        },
      }
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("space-y-6", className)}
      noValidate
      aria-label="Biểu mẫu đăng nhập"
    >
      {/* Email Input Field */}
      <div className="space-y-2">
        <Label htmlFor="login-email" className="text-xs font-semibold text-slate-700 tracking-wide">
          Email
        </Label>
        <div className="relative">
          <Mail
            className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-slate-400 pointer-events-none"
            aria-hidden="true"
          />
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Nhập email của bạn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={login.isPending}
            className="h-[52px] pl-11 pr-4 text-sm border-slate-200 focus-visible:ring-2 focus-visible:ring-[#0066CC] bg-[#F8FAFC] hover:bg-white focus:bg-white transition-all rounded-xl shadow-2xs placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Password Input Field */}
      <div className="space-y-2">
        <Label htmlFor="login-password" className="text-xs font-semibold text-slate-700 tracking-wide">
          Mật khẩu
        </Label>
        <div className="relative">
          <Lock
            className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-slate-400 pointer-events-none"
            aria-hidden="true"
          />
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={login.isPending}
            className="h-[52px] pl-11 pr-12 text-sm border-slate-200 focus-visible:ring-2 focus-visible:ring-[#0066CC] bg-[#F8FAFC] hover:bg-white focus:bg-white transition-all rounded-xl shadow-2xs placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Ẩn ký tự bảo mật" : "Hiển thị ký tự bảo mật"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC]"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Server Error Alert (Rendered only when error occurs) */}
      {login.error && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/95 p-3 text-xs text-rose-700 shadow-2xs animate-in fade-in duration-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
          <div className="font-medium leading-relaxed">
            {errorMessage(login.error)}
          </div>
        </div>
      )}

      {/* Primary Submit Button */}
      <Button
        type="submit"
        disabled={login.isPending || !email.trim() || !password}
        className="w-full h-[52px] bg-[#0066CC] hover:bg-[#005bb8] active:bg-[#004e9e] text-white text-base font-bold rounded-xl gap-2 shadow-sm hover:shadow-md transition-all disabled:opacity-85 disabled:hover:bg-[#0066CC] disabled:cursor-not-allowed"
      >
        {login.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Đang đăng nhập...</span>
          </>
        ) : (
          <>
            <span>Đăng nhập</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}
