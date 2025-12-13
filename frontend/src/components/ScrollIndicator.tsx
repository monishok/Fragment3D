const ScrollIndicator = () => {
    return (
        <div className="fixed bottom-12 left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
            {/* Double chevron down arrow */}
            <svg
                className="w-8 h-8 text-gray-300 animate-pulse"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ animationDuration: '2s' }}
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                />
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7-7-7"
                />
            </svg>
        </div>
    );
};

export default ScrollIndicator;
