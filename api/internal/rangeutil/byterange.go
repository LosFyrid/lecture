package rangeutil

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

var (
	ErrUnsupportedRange = errors.New("unsupported range")
	ErrInvalidRange     = errors.New("invalid range")
)

type ByteRange struct {
	Start int64
	End   int64
}

func (r ByteRange) Length() int64 {
	return r.End - r.Start + 1
}

// ParseSingleRange parses an HTTP Range header for a single bytes range.
// It supports:
//   - bytes=<start>-<end>
//   - bytes=<start>-
//   - bytes=-<suffixLength>
//
// It does not support multiple ranges (comma-separated).
func ParseSingleRange(rangeHeader string, size int64) (ByteRange, error) {
	rangeHeader = strings.TrimSpace(rangeHeader)
	if rangeHeader == "" {
		return ByteRange{}, ErrInvalidRange
	}
	if !strings.HasPrefix(strings.ToLower(rangeHeader), "bytes=") {
		return ByteRange{}, ErrInvalidRange
	}

	spec := strings.TrimSpace(rangeHeader[len("bytes="):])
	if spec == "" {
		return ByteRange{}, ErrInvalidRange
	}
	if strings.Contains(spec, ",") {
		return ByteRange{}, ErrUnsupportedRange
	}

	if size <= 0 {
		return ByteRange{}, ErrInvalidRange
	}

	// Suffix range: bytes=-N
	if strings.HasPrefix(spec, "-") {
		suffixStr := strings.TrimSpace(spec[1:])
		suffix, err := strconv.ParseInt(suffixStr, 10, 64)
		if err != nil || suffix <= 0 {
			return ByteRange{}, ErrInvalidRange
		}
		if suffix >= size {
			return ByteRange{Start: 0, End: size - 1}, nil
		}
		return ByteRange{Start: size - suffix, End: size - 1}, nil
	}

	parts := strings.SplitN(spec, "-", 2)
	if len(parts) != 2 {
		return ByteRange{}, ErrInvalidRange
	}
	startStr := strings.TrimSpace(parts[0])
	endStr := strings.TrimSpace(parts[1])

	start, err := strconv.ParseInt(startStr, 10, 64)
	if err != nil || start < 0 {
		return ByteRange{}, ErrInvalidRange
	}
	if start >= size {
		return ByteRange{}, ErrInvalidRange
	}

	if endStr == "" {
		return ByteRange{Start: start, End: size - 1}, nil
	}

	end, err := strconv.ParseInt(endStr, 10, 64)
	if err != nil || end < 0 {
		return ByteRange{}, ErrInvalidRange
	}
	if end < start {
		return ByteRange{}, ErrInvalidRange
	}
	if end >= size {
		end = size - 1
	}

	if start > end {
		return ByteRange{}, fmt.Errorf("%w: start > end after clamp", ErrInvalidRange)
	}

	return ByteRange{Start: start, End: end}, nil
}

