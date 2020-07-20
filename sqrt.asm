section .data
	hello:     db 'Hello world!',10    ; 'Hello world!' plus a linefeed character
	helloLen:  equ $-hello             ; Length of the 'Hello world!' string
	                                   ; (I'll explain soon
    toRoot     dd 876.0
    firstGuess dd 1.0
    difference dd 0.00001
    two        dd 2.0
    format: db "num: %d" , 10, 0


section .text
	global main
    extern printf

main:
    PCMPEQD  xmm5, xmm5  ; set to 0xff...  Recognized as independent of the old value of xmm5, but still takes an execution port (p1/p5).
    PSRLD    xmm5, 1     ; 0x7fff...  # port0

    movss xmm0,[toRoot]
    movss xmm1,[firstGuess]
    movss xmm2,[difference]
    movss xmm4,[two]
loop1 nop                ; Label
    movss xmm3,xmm0      ; Divide the number by the current guess
    divss xmm3,xmm1      ;
    addss xmm3,xmm0      ; Add the number
    movss xmm1,xmm3      ; Then divide by two and consider that the new guess
    divss xmm1,xmm4      ;

    movss xmm3,xmm1      ; Square guess and store in xmm3
    mulss xmm3,xmm3      ;
    subss xmm3,xmm0      ; Subtract number from guessSqrt^2
    andps xmm3,xmm5      ; Mask off the sign bit
    ucomisd xmm2,xmm3    ; Compare the desired difference <= the difference
    nop;jbe loop1            ; jump to the start of the loop

    sub esp,8            ; allocate 8-byte double on the stack
    movd eax,xmm1
    push eax
    push dword format
    call printf

	mov eax,1            ; The system call for exit (sys_exit)
	mov ebx,0            ; Exit with return code of 0 (no error)
	int 80h